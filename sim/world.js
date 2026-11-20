// The region's other caravans (D-856 Milestone B: "three AI caravans"; plan: docs/design/region-simulation-plan.md §4, D-677,
// D-678). Each AI caravan runs through the same engine as the player (its own state, the same rules), on one of the other default
// starting suits (D-410), with the documented starting decks (D-162, D-163). They share the region's markets and the checkpoint
// requirement (D-419: shared). Its decisions come from one of the four approved profiles (D-678; plan §4.6: Trader, Developer,
// Smuggler, Brawler), made only from the actions the engine offers it, which hold no hidden information (D-676).
// Movement order each round (D-711, D-678 B2): losers of their last Zsír encounter move first, then those without a decided result,
// then winners; random within each group.
// Meetings (D-730, D-731, D-860): at a POI or an encounter point (never a settlement), after each caravan's own event, caravans
// there may duel (D-186, D-202 to D-205, D-224, D-734) or the player may ambush (D-184). Also built since: shared location matches
// with caravans in the seats (D-914; at POIs D-933), AI-to-AI meetings (D-937) and the abilities that act on other caravans (D-915).
// Humans meeting each other: multi.js (D-1188, D-1189).
import { newGame, enterRegion, options, act, cardValue, cutValue, requirementStatus, cardName, checkRun, bankrupt, startCaravanAmbush, counted, trimCargo, saddlebag, deployed, illicit, meetingInspection, afterDuel } from "./engine.js";
import { legal, act as zact, aiChoose, duelMatch, duelOutcome } from "./zsir.js";
import { onPlay, onTrick, AGRI, FOREST, TOWNS, FISH, BANDITS } from "./abilities.js";
import { RULES, ALL_SUITS } from "./rules.js";
import { makeRng } from "./rng.js";
import { PLACEHOLDER } from "./rules.js";

export const PROFILES = ["Trader", "Developer", "Smuggler", "Brawler"];
// the four civilisations available from the start (D-161, D-410): you pick one, the AI caravans are the other three
export const START_CIVS = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk"];
export const NAMES = { Farmfolk: "the farmers' caravan", Clergy: "the pilgrims' caravan", Forestfolk: "the foresters' caravan", Tradesfolk: "the merchants' caravan",
  Beasts: "the beast-drovers' caravan", Bandits: "the outlaws' caravan", Townsfolk: "the townsmen's caravan", "King's Men": "the King's Men's caravan",
  Hillfolk: "the hillmen's caravan", Carnivalfolk: "the carnival caravan", Fisherfolk: "the fishermen's caravan", Plainsfolk: "the herdsmen's caravan" };
// the rival caravans: every civilisation can field one (D-449), with its documented starting decks (D-162, D-163, D-619); three of
// the eleven that aren't yours, drawn at random each run (D-1185)
export function rivalCivs(rng, used) {
  const pool = ALL_SUITS.filter((c) => !used.has(c));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool;
}

export function newWorld(board, seed = 1, mode = "normal", opts = {}) {
  const player = newGame(board, seed, mode, { ...opts, civ: opts.civ || "Farmfolk" }), rng = makeRng(seed * 7 + 3);
  const profiles = rng.shuffle ? rng.shuffle(PROFILES.slice()) : PROFILES.slice().sort(() => rng.next() - 0.5);
  // your civilisation: any you've unlocked (D-418); the rivals: three of the other eleven (D-449; D-1185)
  const mine = opts.civ || "Farmfolk";
  const rivals = opts.rivals || rivalCivs(rng, new Set([mine])).slice(0, 3);
  const ais = rivals.map((civ, k) => {
    const st = newGame(board, seed * 101 + k + 1, mode, { civ });
    st.markets = player.markets; st.fences = player.fences; st.taverns = player.taverns; st.sharedMarkets = true;   // one set of stalls, fences and taverns
    st.glitch = player.glitch;                                    // one world: the same places glitch for everyone (D-751)
    st.requirement = player.requirement;                          // the checkpoint's orders are the same for every caravan
    st.kingTastes = player.kingTastes;                            // one King (D-434)
    st.ai = { civ, profile: profiles[k], name: NAMES[civ], rng: makeRng(seed * 31 + k) };
    return st;
  });
  const world = { player, ais, rng };
  for (const st of ais) st.world = world;
  player.world = world;
  // other caravans at your settlement or POI when a match comes up may take seats in it (D-408, D-425, D-914, D-933); each decides by its profile
  player.joiners = (st) => ais.filter((ai) => !ai.ended && ai.caravan.at === st.caravan.at && ["settlement", "poi"].includes(st.stops[st.caravan.at].kind)
    && ai.ai.rng.next() < { Trader: 0.5, Developer: 0.8, Smuggler: 0.6, Brawler: 1 }[ai.ai.profile]).slice(0, 3);
  return world;
}

/** the run goes on (D-326, D-430): after you pass a region's checkpoint, the AI caravans still on its road finish it; those that
 *  passed cross with you into the next region; the failed ones are out for the rest of the run (your ruling, 2026-11-05) */
export function finishRegion(world) {
  for (const st of world.ais) for (let k = 0; k < 30 && !st.ended; k++) stepAI(st);
  for (const st of world.ais) if (st.ended && !st.gone) { st.gone = true; st.ai.result = st.ended; }
}
export function nextRegion(world, board) {
  finishRegion(world);
  const p = world.player; enterRegion(p, board);
  for (const st of world.ais) {
    if (!(st.ended && st.ended.won && st.ended.crossing)) continue;           // out of the run
    st.round = p.round; enterRegion(st, board); st.gone = false; st.ai.result = null;
    st.markets = p.markets; st.fences = p.fences; st.taverns = p.taverns; st.requirement = p.requirement; st.castle = p.castle; st.glitch = p.glitch;
  }
  world.meet = null; world.pendingAfter = null;
  const on = world.ais.filter((st) => !st.ended).map((st) => st.ai.name);
  p.log.push({ round: p.round, text: on.length ? `Crossing with you: ${on.join(", ")}.` : "No other caravan made it this far.", kind: "info" });
}

// where each caravan can be seen: only at settlements and POIs, never on a road or at an encounter point (D-396, D-712)
// Tracking (Wily Poacher line in your personal deck) also shows every caravan off the highway, wherever it is; Nose for Wealth (Heady
// Townsfolk X line) the one with the richest cargo (D-717)
export function visibleCaravans(world) {
  const p = world.player.caravan, tracking = p.personal.some(FOREST.wily), rich = p.personal.some(TOWNS.heady) ? richest(world) : null;
  return world.ais.filter((s) => !s.gone).map((s) => ({ state: s, stop: s.stops[s.caravan.at] }))
    .filter(({ state, stop }) => stop && (stop.kind === "settlement" || stop.kind === "poi" || (tracking && !state.caravan.onHighway) || state === rich))
    .map(({ state, stop }) => ({ name: state.ai.name, civ: state.ai.civ, at: stop.id, stop, state, how: stop.kind === "settlement" || stop.kind === "poi" ? "seen" : state === rich ? "Nose for Wealth" : "Tracking" }));
}
// the caravan with the highest total cargo sale value, yours included; coins don't count; no value shown (urban.md, D-717)
export function richest(world) {
  const worth = (s) => s.caravan.cargo.reduce((a, x) => a + Math.round(cardValue(x) * RULES.marketSell), 0);
  return [world.player, ...world.ais.filter((s) => !s.gone)].reduce((a, b) => (worth(b) > worth(a) ? b : a));
}

// inspecting a visible caravan (D-396): a random selection of its actual cargo cards and an estimate of how full the wagon is;
// selection size PLACEHOLDER (the ruling gives none)
// Privacy Screen (Reed Bundles in its cargo: no inspection; Reed Mat: not through abilities either, D-576, D-577); Tavern Gossip (Sharp
// Townsfolk Alsó line in the inspector's personal deck): the cargo count per rank; Misinformation (Artful Townsfolk Felső line in
// the inspected caravan's personal deck): each reported card may be false, freshly each time (urban.md; chance PLACEHOLDER)
// its own random numbers, so looking never moves the run's (an online game's clients must stay identical, D-956)
export function inspectCaravan(world, ai, viewer = world.player) { return inspectOf(world.lookRng ??= makeRng(((world.player?.seed || 1) * 977 + 13) >>> 0), viewer.caravan, ai.caravan); }
function inspectOf(rng, viewer, c) {
  const screen = Math.max(0, ...c.cargo.filter((x) => FISH.reeds(x)).map((x) => x.refined || 0));
  const f = c.cargo.length / c.capacity, fullness = f < 0.35 ? "lightly loaded" : f < 0.65 ? "about half full" : f < 0.9 ? "well loaded" : "nearly full";
  // Misinformation falsifies the reported cargo, the Tavern Gossip counts included (urban.md; D-1204)
  const fib = c.personal.some(TOWNS.artful), RK = ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"];
  const gossip = viewer.personal.some(TOWNS.sharp) && screen < 2 ? Object.fromEntries(RK.map((r) => { const n0 = c.cargo.filter((x) => x.rank === r).length;
    return [r, fib && rng.next() < PLACEHOLDER.misinformation ? Math.max(0, n0 + rng.pick([-2, -1, 1, 2])) : n0]; })) : null;
  if (screen >= 1) return { cards: [], fullness, screened: true, gossip };
  const n = Math.min(PLACEHOLDER.inspectCaravanCards, c.cargo.length), pick = c.cargo.slice();
  for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
  const lies = c.personal.some(TOWNS.artful);
  const cards = pick.slice(0, n).map((x) => (lies && rng.next() < PLACEHOLDER.misinformation ? { rank: rng.pick(["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"]), suit: x.suit, fake: true } : x));
  return { cards, fullness, gossip };
}

// the movement order for one round (D-711)
function order(world) {
  const all = [world.player, ...world.ais.filter((s) => !s.ended)];
  // False Identity (Bandits IX, refined, personal deck): departs a POI last, whatever the last result (thug.md, D-262, D-678 B2)
  const fi = (s) => s.stops[s.caravan.at]?.kind === "poi" && s.caravan.personal.some(BANDITS.papers);
  const group = (s) => (fi(s) ? 3 : s.caravan.lastMatch === "lose" ? 0 : s.caravan.lastMatch === "win" ? 2 : 1);
  const r = world.rng, keyed = all.map((s) => ({ s, k: group(s) * 10 + r.next() }));
  return keyed.sort((a, b) => a.k - b.k).map((x) => x.s);
}

// one round for an AI caravan: from its declaration until the round ends (or the run does)
export function stepAI(st) {
  if (st.world && !st.ended && options(st).phase === "declare") aiMeet(st.world, st);
  const start = st.round;
  for (let k = 0; k < 400 && !st.ended && st.round === start; k++) act(st, decide(st));
  if (st.ended && !st.gone) { st.gone = true; st.ai.result = st.ended; }
}

/** the player's action, with the AI caravans moving around it in D-711's order when it's a move */
export function worldAct(world, action) {
  const p = world.player;
  if (action.type !== "move" || options(p).phase !== "declare") return act(p, action);
  const seq = order(world), me = seq.indexOf(p);
  for (const s of seq.slice(0, me)) if (s !== p) stepAI(s);
  const out = act(p, action);
  // the rest move after the player; if the player's round is still open (a match, an event), they move when it ends
  world.pendingAfter = seq.slice(me + 1);
  flushAfter(world);
  return out;
}
// AI caravans due after the player act once the player's round has closed (they don't see the player's choices, D-716)
export function flushAfter(world) {
  const p = world.player;
  if (!world.pendingAfter || (!p.ended && options(p).phase !== "declare")) return;
  for (const s of world.pendingAfter) if (!s.ended) stepAI(s);
  world.pendingAfter = null;
}

// ---- the four profiles (D-678; plan §4.6). Weights only: every action is one the engine offers
function decide(st) {
  const o = options(st), P = st.ai.profile, r = st.ai.rng, c = st.caravan;
  const want = (card) => st.requirement && st.requirement.test(card);
  switch (o.phase) {
    case "declare": {
      const av = o.moves.filter((m) => m.available);
      const score = (m) => {
        const to = m.to, sv = to.services || [], fees = m.fees.reduce((a, f) => a + (f.waived ? 0 : f.amount), 0), hw = m.leg.segments.some((x) => x.cls === "highway");
        let v = r.next() * 2 - fees * (P === "Trader" ? 0.5 : 0.2);
        if (P === "Trader") v += (sv.includes("Market") ? 3 : 0) + (hw ? 1 : 0);
        if (P === "Developer") v += (sv.includes("Guild") || sv.includes("Magistrates") ? 3 : 0) + (to.kind === "settlement" ? 1 : 0);
        if (P === "Smuggler") v += (hw ? -2 : 2) + (to.kind === "poi" ? 1 : 0);
        if (P === "Brawler") v += (to.kind === "encounter" ? 3 : 0) + (to.kind === "poi" ? 2 : 0);
        if (to.kind === "checkpoint") v += requirementStatus(st).met ? 5 : -1;
        return v;
      };
      const mv = av.sort((a, b) => score(b) - score(a))[0];
      return { type: "move", leg: mv.leg, payments: mv.fees.map((f) => (c.coins >= f.amount ? "coins" : "card")) };
    }
    case "loot": { const t = o.actions.find((x) => x.type === "take" && x.allowed); return t ? { type: "take", i: t.i } : { type: "done-loot" }; }
    case "match-offer": return { type: r.next() < { Trader: 0.5, Developer: 0.8, Smuggler: 0.6, Brawler: 1 }[P] ? "accept" : "decline" };
    case "cp-event": return { type: r.next() < { Trader: 0.4, Developer: 0.6, Smuggler: o.event.kind === "carnival" ? 0.9 : 0.5, Brawler: 1 }[P] ? "cp-play" : "cp-skip" };   // AI design, provisional
    case "excursion-offer": return { type: "excursion", go: r.next() < { Trader: 0.6, Developer: 0.7, Smuggler: 0.8, Brawler: 1 }[P] };   // AI design, provisional
    case "match": { const m = o.match; while (!m.ended) { const L = legal(m); zact(m, L.seat, aiChoose(m, L.seat)); } return { type: "match-done" }; }
    case "recruit": {
      const k = o.eligible.findIndex((x) => want(x) || (P === "Brawler" && (x.rank === "X" || x.rank === "Ász")));
      return k >= 0 && c.cargo.length > 10 ? { type: "recruit", i: k } : { type: "skip-recruit" };
    }
    case "negotiate": {
      const a = o.actions.find((x) => x.allowed !== false && x.type !== "no-offer" && x.type !== "withdraw") || o.actions.find((x) => x.type === "no-offer" || x.type === "withdraw");
      return a.type === "no-offer" || a.type === "withdraw" ? { type: a.type } : { type: a.type, id: a.id };
    }
    case "overflow": { let lo = 0; c.cargo.forEach((x, i) => { if (!want(x) && cardValue(x) < cardValue(c.cargo[lo])) lo = i; }); return { type: "discard", i: lo }; }
    case "breakaway": return { type: "breakaway" };
    case "expose": return { type: "expose-timeout" };
    case "event": {
      const pick = (t) => o.actions.find((a) => a.type === t && a.allowed !== false);
      // a roadside find (minor checkpoint, patrol, gate): as at the checkpoint's discovery, the Brawler fights, a Smuggler bribes
      // when it can, the rest surrender (D-1246)
      if (pick("mc-fight")) {
        const b = P === "Smuggler" && o.actions.filter((x) => x.type === "mc-bribe").sort((x, y) => y.chance - x.chance)[0];
        return b ? { type: "mc-bribe", i: b.i } : { type: P === "Brawler" ? "mc-fight" : "mc-surrender" };
      }
      const a = (P === "Brawler" && pick("confront")) || pick("craft") || pick("friendly") || pick("help") || pick("search") || (P !== "Smuggler" && pick("buy"))
        || pick("pay-toll") || pick("refuse") || pick("leave") || o.actions.find((x) => x.allowed !== false) || o.actions[0];
      return a.i === undefined ? { type: a.type } : { type: a.type, i: a.i };
    }
    case "location": {
      const reserve = 8, acts = o.actions;
      const buy = acts.find((x) => x.type === "buy" && x.allowed && want(x.card) && c.coins - x.price >= 0);
      if (buy && !requirementStatus(st).met) return { type: "buy", i: buy.i };
      // a toll at the checkpoint (D-947): every profile raises the coins by selling spare cargo, keeping 10 cards
      if (st.requirement?.kind === "toll" && c.coins < requirementStatus(st).count + 5) {
        const sl = acts.filter((x) => x.type === "sell" && !x.endsRun && !want(x.card) && c.cargo.length > 10).sort((a2, b2) => b2.price - a2.price)[0];
        if (sl) return { type: "sell", i: sl.i }; }
      if (P === "Developer") { const u = acts.filter((x) => x.type === "upgrade" && x.allowed && c.coins - x.price >= reserve).sort((a, b) => a.price - b.price)[0]; if (u) return { type: "upgrade", deck: u.deck, i: u.i, track: u.track }; }
      if (P === "Trader" && c.cargo.length > 12) { const s = acts.filter((x) => x.type === "sell" && !want(x.card) && !x.endsRun).sort((a, b) => b.price - a.price)[0]; if (s) return { type: "sell", i: s.i }; }
      // mercenaries (AI design, IMP-05): a Brawler or Developer with coins to spare hires one, deploys it and buys its packages
      if (P === "Brawler" || P === "Developer") {
        const hire = acts.find((x) => x.type === "hire" && x.allowed && c.coins - x.price >= reserve * 2), up = acts.find((x) => x.type === "merc-upgrade" && x.allowed && c.coins - x.price >= reserve * 2);
        if (hire && !c.personal.some((x) => x.merc)) { st.ai.hirePartner = hire.merc; return { type: "hire", merc: hire.merc }; }
        if (st.ai.hirePartner != null) { const m2 = st.ai.hirePartner; st.ai.hirePartner = null; return { type: "set-partner", merc: m2 }; }
        if (up) return { type: "merc-upgrade", merc: up.merc };
      }
      // investments: collect dividends at any Guild; a Trader puts surplus coins into the Guild's ventures (AI design, IMP-05)
      const col = acts.find((x) => x.type === "collect-dividends"); if (col) return { type: "collect-dividends" };
      const inv = acts.find((x) => x.type === "invest");
      if (inv && P === "Trader" && c.coins > 40 && !(st.ai.invested ??= new Set()).has(st.round)) { st.ai.invested.add(st.round); return { type: "invest", amount: c.coins - 30 }; }
      // the Fence: a Smuggler sells its illicit goods there and now and then gambles on a blind bin
      if (P === "Smuggler" || P === "Trader") { const fs = acts.find((x) => x.type === "fence-sell" && !x.endsRun && !want(x.card)); if (fs && c.cargo.length > 10) return { type: "fence-sell", i: fs.i }; }
      if (P === "Smuggler") { const bin = acts.find((x) => x.type === "fence-bin" && x.allowed && c.coins - x.price >= reserve); if (bin && r.next() < 0.35 && c.cargo.length < c.capacity - 3) return { type: "fence-bin" }; }
      if (P === "Trader") { const b2 = acts.find((x) => x.type === "buy" && x.allowed && c.coins - x.price >= reserve * 2 && c.cargo.length < c.capacity - 2); if (b2 && r.next() < 0.4) return { type: "buy", i: b2.i }; }
      // smuggled valuables: a Smuggler or Trader sells foreign X and Ász to a Fence when the checkpoint doesn't want them (D-417)
      if (P === "Smuggler" || P === "Trader") { const sm = acts.filter((x) => x.type === "fence-smuggle" && !x.endsRun && !want(x.card)).sort((a, b) => b.price - a.price)[0]; if (sm && c.cargo.length > 10) return { type: "fence-smuggle", i: sm.i }; }
      if (acts.some((x) => x.type === "royal-castle")) return { type: "royal-castle" };
      return { type: "leave" };
    }
    case "checkpoint": return { type: "submit" };
    case "shortfall": return { type: o.actions.some((x) => x?.type === "req-bribe" && x.allowed) ? "req-bribe" : "accept-shortfall" };   // bribery at evaluation (D-107; D-1242)
    case "guard": return { type: o.actions[0].allowed ? "pay-guard" : "refuse-guard" };
    case "discovery": {
      if (P === "Smuggler") { const b = o.actions.filter((x) => x.type === "bribe").sort((a, b2) => b2.chance - a.chance)[0]; if (b) return { type: "bribe", share: b.share }; }
      return { type: P === "Brawler" ? "fight" : "surrender" };
    }
    default: return { type: "leave" };
  }
}

// ================================================================ meetings (D-730, D-731, D-860)
const titled = (n) => n[0].toUpperCase() + n.slice(1);
/** caravans you've met: the AI caravans at your stop, if it's a POI or an encounter point (two caravans at an encounter point see
 *  each other, D-730; no inter-caravan battles in settlements, D-860) */
export function meetings(world) {
  const p = world.player, here = p.stops[p.caravan.at];
  if (!here || (here.kind !== "poi" && here.kind !== "encounter") || p.ended) return [];
  return world.ais.filter((s) => !s.ended && s.caravan.at === p.caravan.at);
}
const value = (x) => cutValue(x);                         // wagers: base or refined value, Merchant's Cut included (D-224, D-274, D-278)
export const stakeValue = (st) => (st.cards || []).reduce((a, x) => a + value(x), 0) + (st.coins || 0);
// the AI's own read of a caravan it has met: the cards an inspection shows (D-396); it knows no more than a player would (D-676)
function peek(world, viewerRng, c, viewer) { return inspectOf(viewerRng, viewer || c, c).cards; }
// cards and coins totalling exactly v from a caravan's own cargo (D-224: exact equality; coins make up the difference)
function stakeOf(c, v, rng, keep = RULES.cargoMinimum) {
  const cards = []; let left = v;
  const pool = c.cargo.slice().sort(() => rng.next() - 0.5);
  for (const x of pool) if (value(x) <= left && c.cargo.length - cards.length > keep) { cards.push(x); left -= value(x); if (left === 0) break; }
  if (left > c.coins) return null;
  return { cards, coins: left };
}

/** at the start of your round, a caravan you've met may challenge you (once per meeting) */
export function aiChallenges(world) {
  const p = world.player;
  if (world.meet || options(p).phase !== "declare") return null;
  for (const ai of meetings(world)) {
    const key = `${p.round}:${ai.ai.civ}`; if ((world.asked ??= new Set()).has(key)) continue; world.asked.add(key);
    const P = ai.ai.profile, r = ai.ai.rng;
    if (r.next() >= { Brawler: 0.6, Smuggler: 0.35, Trader: 0.25, Developer: 0.2 }[P]) continue;
    // the challenger proposes the whole wager (D-204 (1)): one of your cards it saw, and its own stake of the same value
    const seen = peek(world, r, p.caravan, ai.caravan).filter((x) => value(x) > 0); if (!seen.length) continue;
    const want = seen.sort((a, b) => value(b) - value(a))[0], mine = stakeOf(ai.caravan, value(want), r); if (!mine) continue;
    if (want.fake) { note(world, `${titled(ai.ai.name)} looks you over, asks about a card you don't carry, and moves on (Misinformation).`); continue; }
    world.meet = { ai, kind: "challenged", proposal: { theirs: mine, yours: { cards: [want], coins: 0 } }, stage: "offer" };
    return world.meet;
  }
  return null;
}
/** you challenge a caravan you've met (D-202): your stake and what you ask of theirs, at exactly equal value (D-224, D-734) */
export function challenge(world, ai, yours, theirs) {
  if (stakeValue(yours) !== stakeValue(theirs) || stakeValue(yours) <= 0) throw new Error("the two stakes must be exactly equal (D-224)");
  const ok = aiAccepts(ai, theirs, yours);
  world.meet = { ai, kind: "challenging", proposal: { yours, theirs }, stage: ok ? "agreed" : "refused" };
  if (ok) return startDuel(world);
  // the challenged may make one counteroffer (D-204 (2)); an AI makes one when a smaller wager is within its appetite (D-1175)
  const co = aiCounter(world, ai, yours, theirs);
  if (co) { world.meet = { ai, kind: "countered", proposal: co, stage: "counter" };
    note(world, `${titled(ai.ai.name)} won't risk that much, but counters: their ${stakeValue(co.theirs)} against your ${stakeValue(co.yours)}.`); return world.meet; }
  note(world, `${titled(ai.ai.name)} declines your challenge.`);   // D-412's responses govern NPC caravans (D-449); your own answer to a refusal is yours to make
  world.meet = null; return null;
}
// the AI's counteroffer to your challenge: the largest wager it would accept, cut from the same stakes (the cards you asked of
// it, then coins; the cards you offered, then coins), still exactly equal (D-224); none when nothing smaller works (D-1175)
function aiCounter(world, ai, yours, theirs) {
  const c = ai.caravan, me = world.player.caravan, wealth = c.cargo.reduce((a, x) => a + value(x), 0) + c.coins;
  const appetite = { Brawler: 0.45, Smuggler: 0.3, Trader: 0.2, Developer: 0.15 }[ai.ai.profile];
  const fit = (cards, v, coins) => { const out = []; let left = v;
    for (const x of cards.slice().sort((a, b) => value(b) - value(a))) if (value(x) <= left) { out.push(x); left -= value(x); }
    return left <= coins ? { cards: out, coins: left } : null; };
  for (let v = Math.min(stakeValue(theirs), Math.floor(appetite * wealth)) - (stakeValue(theirs) <= Math.floor(appetite * wealth) ? 1 : 0); v > 0; v--) {
    const its = fit((theirs.cards || []).filter((x) => c.cargo.includes(x)), v, c.coins), mine = its && fit(yours.cards || [], v, me.coins);
    if (its && mine && aiAccepts(ai, its, mine)) return { yours: mine, theirs: its };
  }
  return null;
}
/** your answer to an AI's counteroffer to your challenge: take it (the duel) or reject it (no duel, D-204 (3)) */
export function answerCounter(world, ok) {
  const mt = world.meet; if (!mt || mt.kind !== "countered") throw new Error("no counteroffer to answer");
  if (ok) { note(world, `You take ${mt.ai.ai.name}'s counteroffer.`); return startDuel(world); }
  note(world, `You reject the counteroffer: no duel (D-204 (3)).`); world.meet = null; return null;
}
// does the AI caravan agree a wager? it must hold what's asked, keep its 8 cards if it can (it knows the threshold, D-224), and its
// profile decides how much it's willing to risk (AI design, IMP-05)
function aiAccepts(ai, its, other) {
  const c = ai.caravan;
  if ((its.coins || 0) > c.coins || (its.cards || []).some((x) => !c.cargo.includes(x))) return false;
  const risk = stakeValue(its) / Math.max(1, c.cargo.reduce((a, x) => a + value(x), 0) + c.coins);
  const appetite = { Brawler: 0.45, Smuggler: 0.3, Trader: 0.2, Developer: 0.15 }[ai.ai.profile];
  return risk <= appetite && c.cargo.length - (its.cards || []).length >= RULES.cargoMinimum - (ai.ai.profile === "Brawler" ? 1 : 0);
}
/** your answer to a challenge: accept, refuse, or one counteroffer (D-204 (2)) */
export function answer(world, how, counter = null) {
  const mt = world.meet; if (!mt || mt.kind !== "challenged") throw new Error("no challenge to answer");
  if (how === "accept") return startDuel(world);
  if (how === "counter") {
    if (!counter || stakeValue(counter.yours) !== stakeValue(counter.theirs)) throw new Error("the two stakes must be exactly equal (D-224)");
    if (aiAccepts(mt.ai, counter.theirs, counter.yours)) { mt.proposal = counter; note(world, `${titled(mt.ai.ai.name)} takes your counteroffer.`); return startDuel(world); }
    note(world, `${titled(mt.ai.ai.name)} rejects the counteroffer: no duel (D-204 (3)).`);   // a failed negotiation: as a refusal
  }
  return refused(world);
}
// the challenger's answer to a refusal, by its civilisation (D-412, D-449)
function refused(world) {
  const mt = world.meet, ai = mt.ai, p = world.player, civ = ai.ai.civ, r = ai.ai.rng;
  if (how(civ) === "accept") { note(world, `${titled(ai.ai.name)} shrugs and lets it go.`); world.meet = null; return null; }
  if (civ === "Forestfolk") {
    if (r.next() < 0.5) { note(world, `${titled(ai.ai.name)} accepts the refusal peacefully.`); world.meet = null; return null; }
    // a toll (amount PLACEHOLDER, the ruling gives none); Tax Evasion bypasses it (D-499, D-514)
    if (p.caravan.personal.some(AGRI.ebborz)) { note(world, "The foresters demand a toll, but your badger's tunnels take you round it (Tax Evasion)."); world.meet = null; return null; }
    world.meet = { ai, kind: "toll", amount: PLACEHOLDER.forestToll }; note(world, `${titled(ai.ai.name)} demands a toll of ${PLACEHOLDER.forestToll} coins for passing through.`, "warn");
    return world.meet;
  }
  // Bandits always attempt an ambush; Beasts always attack; Plainsfolk 50 % accept, 50 % attempt an ambush; Hillfolk attack in
  // Hillfolk territory (the region's encounter suits include Hillfolk) and accept elsewhere; the ordinary ambush rules decide it
  // (D-412). Soothing stops a follow-up attack (D-513)
  const attack = civ === "Bandits" || civ === "Beasts" || (civ === "Plainsfolk" && r.next() >= 0.5) || (civ === "Hillfolk" && (p.reqCtx?.regionSuits || []).includes("Hillfolk"));
  if (["Bandits", "Beasts", "Plainsfolk", "Hillfolk"].includes(civ)) {
    if (!attack) { note(world, `${titled(ai.ai.name)} lets it go.`); world.meet = null; return null; }
    if (p.caravan.personal.some(AGRI.soothing)) { note(world, `${titled(ai.ai.name)} bristles, but the chamomile calms them: no attack (Soothing).`); world.meet = null; return null; }
    note(world, `${titled(ai.ai.name)} won't take no for an answer: ${civ === "Beasts" ? "the beasts attack" : "they attack"}!`, "bad");
    world.meet = null; startCaravanAmbush(p, ai, false); return "ambush";
  }
  // King's Men: one of three at random: increased suspicion; no consequences unless you've broken the law (illicit cargo: then the
  // same report); a cargo inspection (D-412; equal odds, PLACEHOLDER)
  if (civ === "King's Men") {
    const k = Math.floor(r.next() * 3); world.meet = null;
    if (k === 2) { note(world, `${titled(ai.ai.name)} insists on inspecting your cargo.`, "warn"); meetingInspection(p); return "inspection"; }
    if (k === 1 && !p.caravan.cargo.some(illicit)) { note(world, `${titled(ai.ai.name)} finds nothing wrong with you and rides on.`); return null; }
    p.caravan.reported = (p.caravan.reported || 0) + PLACEHOLDER.reportedSuspicion;
    note(world, `${titled(ai.ai.name)} reports you: +${PLACEHOLDER.reportedSuspicion} suspicion for the rest of this region.`, "warn"); return null;
  }
  if (civ === "Tradesfolk") {
    // a trade offer (D-395: 1–4 cards, both agree, coins can be included): one of its cards for one of yours it saw, the difference in coins
    const yours = peek(world, r, p.caravan, ai.caravan).filter((x) => !x.fake)[0], theirs = ai.caravan.cargo.length > RULES.cargoMinimum ? ai.caravan.cargo[Math.floor(r.next() * ai.caravan.cargo.length)] : null;
    if (!yours || !theirs) { world.meet = null; return null; }
    const diff = value(yours) - value(theirs);
    world.meet = { ai, kind: "trade", give: yours, get: theirs, coins: diff };   // coins > 0: they pay you; < 0: you pay them
    note(world, `${titled(ai.ai.name)} offers a trade instead.`); return world.meet;
  }
  world.meet = null; return null;
}
const how = (civ) => (["Clergy", "Townsfolk", "Farmfolk", "Carnivalfolk", "Fisherfolk"].includes(civ) ? "accept" : "other");
export function payToll(world, pay) {
  const mt = world.meet, p = world.player; if (!mt || mt.kind !== "toll") throw new Error("no toll");
  world.meet = null;
  if (pay && p.caravan.coins >= mt.amount) { p.caravan.coins -= mt.amount; mt.ai.caravan.coins += mt.amount; note(world, `You pay the foresters ${mt.amount} coins and pass.`); return null; }
  // refusing the toll: they attack, by the ordinary ambush rules (D-202, D-412); Soothing stops the attack (D-513, D-514)
  if (p.caravan.personal.some(AGRI.soothing)) { note(world, "The foresters bristle, but the chamomile calms them: no attack (Soothing)."); return null; }
  note(world, `You refuse the toll. ${titled(mt.ai.ai.name)} attacks!`, "bad");
  startCaravanAmbush(p, mt.ai, false); return "ambush";
}
export function trade(world, ok) {
  const mt = world.meet, p = world.player, c = p.caravan, ac = mt.ai.caravan; if (!mt || mt.kind !== "trade") throw new Error("no trade");
  world.meet = null;
  if (!ok) { note(world, "You decline the trade."); return; }
  if (mt.coins < 0 && c.coins < -mt.coins) { note(world, "You can't cover the difference."); return; }
  c.cargo.splice(c.cargo.indexOf(mt.give), 1); ac.cargo.splice(ac.cargo.indexOf(mt.get), 1); c.cargo.push(mt.get); ac.cargo.push(mt.give);
  c.coins += mt.coins; ac.coins -= mt.coins; trimCargo(ac);
  note(world, `Traded ${cardName(mt.give)} for ${cardName(mt.get)}${mt.coins ? `, ${Math.abs(mt.coins)} coins ${mt.coins > 0 ? "to you" : "from you"}` : ""}.`, "good");
  checkRun(p);
}
/** a trade you propose to a caravan you've met (D-395): 1–4 cards in all, coins may be included, both must agree. The AI agrees
 *  when what it gets is worth at least what it gives (a Trader wants a tenth more), it holds what's asked and keeps its 8 cargo
 *  cards (AI design, provisional; D-1179) */
export function proposeTrade(world, ai, yours, theirs) {
  const p = world.player, c = p.caravan, ac = ai.caravan, n = (yours.cards || []).length + (theirs.cards || []).length;
  if (n < 1 || n > 4) throw new Error("a trade involves 1 to 4 cards (D-395)");
  if ((yours.coins || 0) > c.coins || (yours.cards || []).some((x) => !c.cargo.includes(x))) throw new Error("you don't hold that");
  const holds = (theirs.coins || 0) <= ac.coins && (theirs.cards || []).every((x) => ac.cargo.includes(x));
  const keeps = ac.cargo.length - (theirs.cards || []).length + (yours.cards || []).length >= RULES.cargoMinimum;
  const fair = stakeValue(yours) >= stakeValue(theirs) * (ai.ai.profile === "Trader" ? 1.1 : 1);
  if (!holds || !keeps || !fair) { note(world, `${titled(ai.ai.name)} turns the trade down${!fair ? " (not worth it to them)" : ""}.`); return false; }
  for (const x of yours.cards || []) { c.cargo.splice(c.cargo.indexOf(x), 1); ac.cargo.push(x); }
  for (const x of theirs.cards || []) { ac.cargo.splice(ac.cargo.indexOf(x), 1); c.cargo.push(x); }
  c.coins += (theirs.coins || 0) - (yours.coins || 0); ac.coins += (yours.coins || 0) - (theirs.coins || 0); trimCargo(ac);
  note(world, `Traded with ${ai.ai.name}: your ${[...(yours.cards || []).map(cardName), ...(yours.coins ? [`${yours.coins} coins`] : [])].join(", ") || "nothing"} for their ${[...(theirs.cards || []).map(cardName), ...(theirs.coins ? [`${theirs.coins} coins`] : [])].join(", ") || "nothing"}.`, "good");
  checkRun(p); return true;
}
/** you ambush a caravan you've met (D-184; never in a settlement, D-860): the ordinary ambush rules, your side leads */
export function ambushCaravan(world, ai) { note(world, `You fall upon ${ai.ai.name}.`, "warn"); return startCaravanAmbush(world.player, ai, true); }

// ---- the duel (D-186, D-205): 2v2 on personal cards, at most two tricks, confrontation points; the wager is the only reward
function startDuel(world) {
  const mt = world.meet, p = world.player, r = p.rng;
  const dep = deployed(p.caravan);   // your partner: the companion or a mercenary (D-186, D-156)
  const dOpp = deployed(mt.ai.caravan);   // their partner too: the companion or a mercenary (D-186, D-1188; D-1231)
  const m = duelMatch({ rng: r, playerPersonal: dep.personal, opponentPersonal: dOpp.personal, opponentCompanion: dOpp.companion, value: cardValue, companion: dep.companion,
    learnSuit: mt.kind === "challenging" ? (p.civ || null) : mt.ai.ai.civ,   // the challenger's identity (D-534)
    names: ["You", titled(mt.ai.ai.name), dep.companion ? dep.companion.name : "Companion", `${mt.ai.ai.civ} companion`], onPlay: onPlay(r), onTrick: onTrick(r, p.caravan.personal, p.caravan.cargo) });
  m.richer = (seat) => { const o = seat % 2 === 0 ? p : mt.ai, others = [p, ...world.ais].filter((x) => x !== o && !x.gone); return others.every((x) => o.caravan.coins > x.caravan.coins); };
  mt.stage = "duel"; mt.m = m; note(world, `A duel with ${mt.ai.ai.name}: your ${stakeValue(mt.proposal.yours)} against their ${stakeValue(mt.proposal.theirs)} (D-224).`);
  return m;
}
export function finishDuel(world) {
  const mt = world.meet, p = world.player, c = p.caravan, ac = mt.ai.caravan, o = duelOutcome(mt.m);
  if (p.run) { p.run.tricks += mt.m.history.filter((t) => t.team === 0).length; if (o.result === "win") p.run.games += 1; }   // a duel's tricks and win count (D-416; D-1239)
  const move = (from, to, st) => { for (const x of st.cards || []) { const i = from.cargo.indexOf(x); if (i >= 0) { from.cargo.splice(i, 1); to.cargo.push(x); } } from.coins -= st.coins || 0; to.coins += st.coins || 0; };
  if (o.result === "win") move(ac, c, mt.proposal.theirs);
  if (o.result === "lose") move(c, ac, mt.proposal.yours);
  c.lastMatch = o.result; ac.lastMatch = o.result === "win" ? "lose" : o.result === "lose" ? "win" : "draw"; trimCargo(ac);
  note(world, `Duel over: ${o.pts[0]}–${o.pts[1]} in confrontation points. ${o.result === "win" ? "You win the wager." : o.result === "lose" ? "You lose your stake." : "A friendly handshake: both keep their stakes."}`, o.result === "lose" ? "bad" : "good");
  world.meet = null;
  saddlebag(p, c, ac, (t) => note(world, t, "good")); saddlebag(p, ac, c, (t) => note(world, t, "bad")); trimCargo(ac);
  if (checkRun(p)) return;
  afterDuel(p, () => bankrupt(p, mt.ai, "duel"));   // an overfilled wagon: the overflow step, then Scavenging (D-265, D-493; D-1217); then any looting
}
function note(world, text, kind = "info") { world.player.log.push({ round: world.player.round, text, kind }); }

// ================================================================ AI caravans meeting each other (D-730, D-731, D-857)
// The same rules as with you: at a POI or encounter point (never a settlement, D-860), once per round per pair, a caravan may
// challenge another to a duel by its profile (the same odds as its challenges to you); the challenged one accepts by its own
// appetite (aiAccepts); a refusal brings the challenger's civilisation's answer (Clergy let it go; Forestfolk may demand a toll and
// attack if it's refused; Tradesfolk offer a trade, D-412, D-449). What you witness at your own stop goes into your journal
const aiNote = (st, text, kind = "info") => st.log.push({ round: st.round, text, kind });
function aiMeet(world, st) {
  const here = st.stops[st.caravan.at];
  if (!here || (here.kind !== "poi" && here.kind !== "encounter")) return;
  for (const other of world.ais) {
    if (other === st || other.ended || other.caravan.at !== st.caravan.at || options(other).phase !== "declare") continue;
    const key = `${st.round}:${[st.ai.civ, other.ai.civ].sort().join("-")}`; if ((world.aiMet ??= new Set()).has(key)) continue; world.aiMet.add(key);
    const r = st.ai.rng;
    if (r.next() >= { Brawler: 0.6, Smuggler: 0.35, Trader: 0.25, Developer: 0.2 }[st.ai.profile]) continue;
    const seen = peek(world, r, other.caravan, st.caravan).filter((x) => value(x) > 0 && !x.fake); if (!seen.length) continue;
    const want = seen.sort((a, b) => value(b) - value(a))[0], mine = stakeOf(st.caravan, value(want), r); if (!mine) continue;
    const say = (t, k) => { aiNote(st, t, k); aiNote(other, t, k); if (world.player.caravan.at === st.caravan.at && !world.player.ended) note(world, t, k); };
    const A = titled(st.ai.name), B = other.ai.name;
    if (aiAccepts(other, { cards: [want], coins: 0 }, mine)) { aiDuel(world, st, other, mine, { cards: [want], coins: 0 }, say); return; }
    say(`${A} challenges ${B} to a duel; ${B} declines.`);
    if (how(st.ai.civ) === "accept") return;
    const civ = st.ai.civ;
    if (civ === "Bandits" || civ === "Beasts" || (civ === "Plainsfolk" && r.next() >= 0.5) || (civ === "Hillfolk" && (st.reqCtx?.regionSuits || []).includes("Hillfolk"))) {
      if (other.caravan.personal.some(AGRI.soothing)) { say(`${A} bristles, but ${B}'s chamomile calms them (Soothing).`); return; }
      say(`${A} attacks ${B}!`, "warn"); startCaravanAmbush(st, other, true); return;
    }
    if (civ === "King's Men") {
      const k = Math.floor(r.next() * 3);
      if (k === 0 || other.caravan.cargo.some(illicit)) {          // an inspection between AIs finds what's illicit: read as a report
        other.caravan.reported = (other.caravan.reported || 0) + PLACEHOLDER.reportedSuspicion; say(`${A} reports ${B} to the authorities.`); }
      return;
    }
    if (st.ai.civ === "Forestfolk" && r.next() < 0.5) {
      const toll = PLACEHOLDER.forestToll;
      if (other.caravan.personal.some(AGRI.ebborz)) { say(`${titled(B)}'s badger tunnels round the foresters' toll (Tax Evasion).`); return; }   // D-514 (4); D-1204
      if (other.ai.profile !== "Brawler" && other.caravan.coins >= toll) { other.caravan.coins -= toll; st.caravan.coins += toll; say(`${titled(B)} pays ${st.ai.name} a toll of ${toll} coins.`); return; }
      say(`${titled(B)} refuses the foresters' toll, and ${st.ai.name} attacks!`, "warn");
      startCaravanAmbush(st, other, true); return;
    }
    if (st.ai.civ === "Tradesfolk" && other.caravan.cargo.length > RULES.cargoMinimum && st.caravan.cargo.length > RULES.cargoMinimum && r.next() < 0.5) {
      const get = want, give = st.caravan.cargo[Math.floor(r.next() * st.caravan.cargo.length)], diff = value(get) - value(give);
      if (diff >= 0 ? st.caravan.coins >= diff : other.caravan.coins >= -diff) {
        other.caravan.cargo.splice(other.caravan.cargo.indexOf(get), 1); st.caravan.cargo.splice(st.caravan.cargo.indexOf(give), 1);
        st.caravan.cargo.push(get); other.caravan.cargo.push(give); st.caravan.coins -= diff; other.caravan.coins += diff; trimCargo(st.caravan); trimCargo(other.caravan);
        say(`${A} and ${B} trade instead: ${cardName(give)} for ${cardName(get)}.`);
      }
    }
    return;
  }
}
function aiDuel(world, a, b, stakeA, stakeB, say) {
  const r = a.ai.rng, dep = deployed(a.caravan);
  const dB = deployed(b.caravan);
  const m = duelMatch({ rng: r, playerPersonal: dep.personal, opponentPersonal: dB.personal, opponentCompanion: dB.companion, value: cardValue, companion: dep.companion,
    learnSuit: a.ai.civ,   // a challenged b (D-534)
    names: [titled(a.ai.name), titled(b.ai.name), "companion", "companion"], onPlay: onPlay(r), onTrick: onTrick(r, a.caravan.personal, a.caravan.cargo) });
  while (!m.ended) { const L = legal(m); zact(m, L.seat, aiChoose(m, L.seat)); }
  const o = duelOutcome(m), ca = a.caravan, cb = b.caravan;
  const move = (from, to, st) => { for (const x of st.cards || []) { const i = from.cargo.indexOf(x); if (i >= 0) { from.cargo.splice(i, 1); to.cargo.push(x); } } from.coins -= st.coins || 0; to.coins += st.coins || 0; };
  if (o.result === "win") move(cb, ca, stakeB); else if (o.result === "lose") move(ca, cb, stakeA);
  ca.lastMatch = o.result; cb.lastMatch = o.result === "win" ? "lose" : o.result === "lose" ? "win" : "draw";
  saddlebag(a, ca, cb, () => {}); saddlebag(b, cb, ca, () => {});   // Saddlebag Raid in any duel against another caravan (D-1204)
  trimCargo(ca); trimCargo(cb);
  say(`${titled(a.ai.name)} duels ${b.ai.name}: ${o.pts[0]}–${o.pts[1]}, ${o.result === "win" ? `${a.ai.name} wins the wager` : o.result === "lose" ? `${b.ai.name} wins the wager` : "a draw"}.`);
  const [winner, loser] = o.result === "win" ? [a, b] : o.result === "lose" ? [b, a] : [null, null];
  if (winner) bankrupt(winner, loser, "duel");
}
