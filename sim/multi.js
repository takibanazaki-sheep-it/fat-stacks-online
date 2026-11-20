// Online multiplayer, the game side (D-955, D-956): two to four human caravans in one run, the AI caravans filling the table to
// four (D-825 (6), D-827). Every client holds the same world and applies the same entries in the same order (the host accepts
// and orders them), so this file only turns entries into the ordinary engine and world calls; the network lives in ui/net.js.
//
// Rounds (D-703, D-711): each human declares a move; when every human still on the road has declared, the round resolves in
// D-711's order (losers first, then the undecided, then winners; random within each group), humans and AI caravans alike. A
// human whose move opens something (a match, an event, a negotiation) is resolved before the next caravan moves. A human may
// declare their next move while others are still resolving. Region crossings wait until every human has finished the region
// (passed or out); then everyone who passed crosses together (D-927 (1)).
//
// Players meeting each other (D-1188, D-1189): trades, duels and ambushes between players at the same POI or encounter point at the
// start of a round (humansMet, hmeet); players at the same place are asked to the table of a location match (D-914; tableReady). A
// hidden site's excursion is decided by the first caravan to reach the host in a round, for all (D-706 (2)). Every human gets AI
// challenges at the start of their own round as in solo.
import { newGame, enterRegion, options, act, cardValue, cutValue, cardName, checkRun, deployed, saddlebag, tableReady, startCaravanAmbush, afterDuel } from "./engine.js";
import { START_CIVS, NAMES, rivalCivs, stepAI, finishRegion, aiChallenges, challenge, answer, payToll, trade, ambushCaravan, finishDuel, answerCounter, proposeTrade } from "./world.js";
import { legal, act as zact, aiChoose, idCounter, duelMatch, duelOutcome, command as zcommand } from "./zsir.js";
import { makeRng } from "./rng.js";
import { BANDITS, onPlay, onTrick } from "./abilities.js";
import { RULES } from "./rules.js";

const PROFILES = ["Trader", "Developer", "Smuggler", "Brawler"];

/** humans: [{ civ, name }] in seat order; the host is seat 0 */
export function newMultiWorld(board, seed, mode, humans, opts = {}) {
  const saved = idCounter(); idCounter(1e6);           // the world's own card ids (restored for anything else on the page)
  const rng = makeRng(seed * 7 + 3);
  const hs = humans.map((h, k) => {
    const st = newGame(board, seed * 131 + k * 1009 + 1, mode, { req: opts.req, civ: h.civ });
    st.human = { seat: k, name: h.name || `Player ${k + 1}`, civ: h.civ };
    return st;
  });
  const lead = hs[0];
  for (const st of hs.slice(1)) { share(st, lead); st.discovered = lead.discovered; }   // POI discovery is shared by the players (D-738; D-1181)
  const profiles = PROFILES.slice(); for (let i = profiles.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [profiles[i], profiles[j]] = [profiles[j], profiles[i]]; }
  const used = new Set(humans.map((h) => h.civ));
  const ais = rivalCivs(rng, used).slice(0, Math.max(0, 4 - humans.length)).map((civ, k) => {   // any civilisation (D-449; D-1185)
    const st = newGame(board, seed * 101 + k + 1, mode, { civ }); share(st, lead);
    st.ai = { civ, profile: profiles[k], name: NAMES[civ] || `the ${civ} caravan`, rng: makeRng(seed * 31 + k) };
    return st;
  });
  const world = { multi: true, humans: hs, ais, rng, player: lead, queue: null, waiting: null, entries: 0 };
  // a challenge, toll or trade belongs to the human it was offered to (world.meet is read and written for the acting seat)
  Object.defineProperty(world, "meet", { get() { return this.player.meetMp ?? null; }, set(v) { this.player.meetMp = v; }, enumerable: false });
  for (const st of [...hs, ...ais]) st.world = world;
  // players already at the place this round are asked to the table (D-914 between people; D-1189)
  for (const st of hs) st.inviteHumans = (me) => world.humans.filter((h) => h !== me && !h.ended && h.caravan.at === me.caravan.at && !h.declared && !h.meetMp && !h.hOffer && options(h).phase === "declare");
  for (const st of hs) st.joiners = (me) => ais.filter((ai) => !ai.ended && ai.caravan.at === me.caravan.at && ["settlement", "poi"].includes(me.stops[me.caravan.at].kind)
    && ai.ai.rng.next() < { Trader: 0.5, Developer: 0.8, Smuggler: 0.6, Brawler: 1 }[ai.ai.profile]).slice(0, 3);
  startOfRound(world);
  world.nextId = idCounter(); idCounter(saved);
  return world;
}
function share(st, lead) { st.markets = lead.markets; st.fences = lead.fences; st.taverns = lead.taverns; st.sharedMarkets = true; st.requirement = lead.requirement; if (lead.castle) st.castle = lead.castle; st.kingTastes = lead.kingTastes; st.glitch = lead.glitch; }
const seatOf = (world, seat) => { const st = world.humans[seat]; if (!st) throw new Error(`no seat ${seat}`); world.player = st; return st; };
const living = (world) => world.humans.filter((h) => !h.ended);

// ---------------------------------------------------------------- encoding: entries carry indices, never object references
export function encodeMove(st, mv) { return { leg: st.board.legs.indexOf(mv.leg), payments: mv.payments || [] }; }
export function encodeZ(m, seat, a) { const o = { ...a }; if (a.card) { o.card = m.hands[seat].indexOf(a.card); if (o.card < 0) throw new Error("card not in hand"); }
  if (a.with) { o.with = m.hands[seat].indexOf(a.with); if (o.with < 0) throw new Error("card not in hand"); } return o; }   // the Bicycle rides with a card (D-780)
const decodeZ = (m, seat, o) => (o.card == null ? o : { ...o, card: m.hands[seat][o.card], ...(o.with != null ? { with: m.hands[seat][o.with] } : {}) });
export function encodeStake(c, s) { return { cards: (s.cards || []).map((x) => c.cargo.indexOf(x)), coins: s.coins || 0 }; }
const decodeStake = (c, s) => ({ cards: s.cards.map((i) => c.cargo[i]), coins: s.coins });
/** the match a human is playing right now: a duel from a meeting, or the match at their location */
export function currentMatch(world, seat) {
  const st = world.humans[seat], mt = st.meetMp;
  if (mt?.m && !mt.m.ended) return mt.m;                    // a duel with an AI caravan, or with another player (either seat)
  const o = options(st); return o.phase === "match" ? o.match : null;
}

// ---------------------------------------------------------------- applying entries (the same on every client)
export function apply(world, e) {
  const saved = idCounter(); idCounter(world.nextId);
  try { applyInner(world, e); } finally { world.nextId = idCounter(); idCounter(saved); }
}
function applyInner(world, e) {
  world.entries++;
  const st = seatOf(world, e.seat ?? 0);
  switch (e.k) {
    case "declare": {
      if (st.ended || options(st).phase !== "declare" || st.meetMp) throw new Error("not your time to declare");
      const mv = options(st).moves.find((m) => m.leg === st.board.legs[e.a.leg] && m.available); if (!mv) throw new Error("that road isn't open");
      st.declared = { type: "move", leg: mv.leg, payments: e.a.payments };
      break;
    }
    case "act": act(st, e.a); break;
    case "zplay": { const m = currentMatch(world, e.seat); if (!m) throw new Error("no match"); zact(m, e.z.seat, decodeZ(m, e.z.seat, e.z)); settle(m); break; }
    case "zcmd": { const m = currentMatch(world, e.seat); if (!m) throw new Error("no match"); zcommand(m, e.z.cmd, e.z.seat); break; }   // a partner call, on every copy (D-1232)
    case "meet": meet(world, st, e); break;
    case "hmeet": hmeet(world, e.seat, e); break;
    case "region": break;   // handled by applyRegion (the board comes with it)
    default: throw new Error("unknown entry " + e.k);
  }
  ambushes(world);
  advance(world);
  // any match a human now sits in plays on to their first decision (AI seats move first when it's their lead)
  for (let s = 0; s < world.humans.length; s++) { const m = currentMatch(world, s); if (m) settle(m); }
}
// the AI seats of a match play on until a human seat is to move (seat 0 is always the human whose match it is)
export function settle(m) { const H = m.humanSeats || [0]; for (let k = 0; k < 500 && !m.ended && !H.includes(legal(m).seat); k++) { const L = legal(m); zact(m, L.seat, aiChoose(m, L.seat)); } }
function meet(world, st, e) {
  const ai = e.ai != null ? world.ais[e.ai] : null;
  if (e.op === "challenge") challenge(world, ai, decodeStake(st.caravan, e.yours), decodeStake(ai.caravan, e.theirs));
  else if (e.op === "answer") answer(world, e.how, e.counter ? { yours: decodeStake(st.caravan, e.counter.yours), theirs: decodeStake(world.meet.ai.caravan, e.counter.theirs) } : null);
  else if (e.op === "counter-answer") answerCounter(world, e.ok);
  else if (e.op === "toll") payToll(world, e.pay);
  else if (e.op === "trade") trade(world, e.ok);
  else if (e.op === "propose-trade") proposeTrade(world, ai, decodeStake(st.caravan, e.yours), decodeStake(ai.caravan, e.theirs));
  else if (e.op === "ambush") ambushCaravan(world, ai);
  else if (e.op === "finish-duel") finishDuel(world);
  else throw new Error("unknown meeting " + e.op);
  const m = world.meet?.m; if (m) settle(m);
}

// ---------------------------------------------------------------- human players meeting each other (D-1188)
// The rules of caravan meetings, between people: two players at the same POI or encounter point (never a settlement, D-860) have
// met (D-730, D-731). Either may propose a trade (D-395: 1–4 cards in all, coins either side, both agree) or challenge the other
// to a duel (D-186, D-202 to D-205, D-224, D-283, D-734): the challenger proposes the whole wager, exactly equal; the challenged
// accepts, refuses or makes one counteroffer, which the challenger accepts or rejects. A refusal between players has no automatic
// consequence: D-412's responses are for NPC caravans (D-449). The duel is the ordinary one (personal cards only, at most two tricks,
// confrontation points; the wager is the only prize), with both players at the table: the challenger at seat 0, the challenged at
// seat 1, each with their own partner. Ambushes between players and seats at each other's tables: below and in engine.js (D-1189).
// an ambush between players (D-184, D-222): the ordinary caravan ambush, the defender's cargo the pool and its military counting;
// the defending player plays seat 1 with their companion at seat 3. Reading (D-1189): the defender's exposed cards are drawn at
// random, as for any caravan. Afterwards a defender below 8 cargo cards is out and the attacker may loot (D-230)
function ambushes(world) {
  world.humans.forEach((h, k) => {
    const a = h.ambush, mt = h.match;
    if (a?.rival?.human && mt?.kind === "ambush" && !mt.m.humanSeats) {
      const v = a.rival.human; mt.m.humanSeats = [0, 1]; v.meetMp = { kind: "h-ambushed", m: mt.m, me: 1, by: k };
      mt.m.names[1] = v.human.name; mt.m.names[3] = `${v.human.name}'s companion`;
    }
  });
  for (const v of world.humans) {
    const mt = v.meetMp; if (!mt || (mt.kind !== "h-ambushed" && mt.kind !== "h-ambush-wait")) continue;
    const by = world.humans[mt.by];
    if (mt.kind === "h-ambush-wait" && !by.ambush) { v.meetMp = null; continue; }                // it never came to a match
    if (mt.kind === "h-ambushed" && mt.m.ended && by.match?.m !== mt.m) {                       // the attacker has settled it
      v.meetMp = null; hnote(v, `The ambush is over.`, "event"); checkRun(v);
    }
  }
}
export function humansMet(world, seat) {
  const me = world.humans[seat], here = me.stops[me.caravan.at];
  // meetings happen at the start of a round (D-731): not while a round is resolving, and only between players free to meet
  if (me.ended || world.queue || !here || (here.kind !== "poi" && here.kind !== "encounter") || options(me).phase !== "declare") return [];
  return world.humans.map((h, k) => ({ h, k })).filter(({ h, k }) => k !== seat && !h.ended && h.caravan.at === me.caravan.at && options(h).phase === "declare");
}
const hname = (st) => st.human.name;
const hnote = (st, text, kind = "info") => st.log.push({ round: st.round, text, kind });
const hstake = (st) => (st.cards || []).reduce((a, x) => a + cutValue(x), 0) + (st.coins || 0);
function hmeet(world, seat, e) {
  const me = world.humans[seat], other = e.to != null ? world.humans[e.to] : null;
  const met = () => { if (!other || !humansMet(world, seat).some((x) => x.k === e.to)) throw new Error("you haven't met that player"); };
  if (e.op === "trade") {                                  // a trade offer to another player
    met(); if (other.hOffer || other.meetMp) throw new Error("they're busy");
    const yours = decodeStake(me.caravan, e.yours), theirs = decodeStake(other.caravan, e.theirs), n = yours.cards.length + theirs.cards.length;
    if (n < 1 || n > 4 || yours.cards.includes(undefined) || theirs.cards.includes(undefined) || yours.coins > me.caravan.coins) throw new Error("not a valid trade (D-395)");
    other.hOffer = { from: seat, yours, theirs };
    hnote(other, `${hname(me)} offers a trade.`, "event"); hnote(me, `You offer ${hname(other)} a trade.`);
  } else if (e.op === "trade-answer") {                   // the answer to a trade offer
    const o = me.hOffer; if (!o) throw new Error("no offer"); me.hOffer = null; const from = world.humans[o.from];
    const ok = e.ok && o.yours.cards.every((x) => from.caravan.cargo.includes(x)) && o.theirs.cards.every((x) => me.caravan.cargo.includes(x)) && from.caravan.coins >= o.yours.coins && me.caravan.coins >= o.theirs.coins;
    if (!ok) { hnote(me, e.ok ? "The trade can't go through any more." : "You decline the trade."); hnote(from, `${hname(me)} ${e.ok ? "can't take" : "declines"} your trade.`); return; }
    for (const x of o.yours.cards) { from.caravan.cargo.splice(from.caravan.cargo.indexOf(x), 1); me.caravan.cargo.push(x); }
    for (const x of o.theirs.cards) { me.caravan.cargo.splice(me.caravan.cargo.indexOf(x), 1); from.caravan.cargo.push(x); }
    from.caravan.coins += o.theirs.coins - o.yours.coins; me.caravan.coins += o.yours.coins - o.theirs.coins;
    const say = (a, b) => [...a.cards.map(cardName), ...(a.coins ? [`${a.coins} coins`] : [])].join(", ") || "nothing";
    hnote(me, `Traded with ${hname(from)}: you get ${say(o.yours)} for ${say(o.theirs)}.`, "good"); hnote(from, `Traded with ${hname(me)}: you get ${say(o.theirs)} for ${say(o.yours)}.`, "good");
    checkRun(me); checkRun(from);
  } else if (e.op === "challenge") {                      // a duel challenge: the whole wager, exactly equal (D-204 (1), D-224)
    met(); if (other.meetMp || me.meetMp) throw new Error("busy");
    const proposal = { yours: decodeStake(me.caravan, e.yours), theirs: decodeStake(other.caravan, e.theirs) };
    if (hstake(proposal.yours) !== hstake(proposal.theirs) || hstake(proposal.yours) <= 0) throw new Error("the two stakes must be exactly equal (D-224)");
    other.meetMp = { kind: "h-challenged", from: seat, proposal }; me.meetMp = { kind: "h-waiting", to: e.to };
    hnote(other, `${hname(me)} challenges you to a duel.`, "event"); hnote(me, `You challenge ${hname(other)} to a duel.`);
  } else if (e.op === "answer") {                         // the challenged player's answer: accept, refuse, or one counteroffer
    const mt = me.meetMp; if (mt?.kind !== "h-challenged") throw new Error("no challenge"); const ch = world.humans[mt.from];
    if (e.how === "accept") return startHDuel(world, mt.from, seat, mt.proposal);
    if (e.how === "counter") {
      const counter = { yours: decodeStake(ch.caravan, e.counter.theirs), theirs: decodeStake(me.caravan, e.counter.yours) };   // the challenger's side first
      if (hstake(counter.yours) !== hstake(counter.theirs) || hstake(counter.yours) <= 0) throw new Error("the two stakes must be exactly equal (D-224)");
      ch.meetMp = { kind: "h-countered", from: seat, proposal: counter }; me.meetMp = { kind: "h-waiting", to: mt.from };
      hnote(ch, `${hname(me)} makes a counteroffer.`, "event"); return;
    }
    me.meetMp = null; ch.meetMp = null; hnote(me, "You refuse the duel."); hnote(ch, `${hname(me)} refuses your challenge.`);
  } else if (e.op === "counter-answer") {                 // the challenger's answer to the counteroffer (D-204 (3))
    const mt = me.meetMp; if (mt?.kind !== "h-countered") throw new Error("no counteroffer");
    if (e.ok) return startHDuel(world, seat, mt.from, mt.proposal);
    me.meetMp = null; world.humans[mt.from].meetMp = null; hnote(me, "You reject the counteroffer: no duel."); hnote(world.humans[mt.from], `${hname(me)} rejects your counteroffer: no duel.`);
  } else if (e.op === "finish-duel") finishHDuel(world, seat);
  else if (e.op === "ambush") {                           // falling upon another player (D-184; never in a settlement, D-860)
    met(); if (other.meetMp || me.meetMp || me.declared) throw new Error("busy");
    const shim = { caravan: other.caravan, ai: { name: hname(other), civ: other.human.civ }, human: other, ended: null };
    other.meetMp = { kind: "h-ambush-wait", by: seat }; hnote(other, `${hname(me)} falls upon your caravan!`, "bad"); hnote(me, `You fall upon ${hname(other)}.`, "warn");
    world.player = me; startCaravanAmbush(me, shim, true);
  } else if (e.op === "table-answer") {                   // the answer to an invitation to someone's table
    const mt = me.meetMp; if (mt?.kind !== "h-invite") throw new Error("no invitation"); const host = world.humans[mt.host], t = host.table;
    if (!t) { me.meetMp = null; return; }
    t.pending = t.pending.filter((x) => x !== seat);
    if (e.join) { t.joined.push(me); me.meetMp = { kind: "h-seated-wait", host: mt.host }; hnote(me, `You take a seat at ${hname(host)}'s table.`); hnote(host, `${hname(me)} takes a seat.`); }
    else { me.meetMp = null; hnote(host, `${hname(me)} doesn't join.`); }
    world.player = host; tableReady(host);
    if (!t.pending.length) for (const g of t.joined) if (g.meetMp?.kind === "h-seated-wait" && host.phase !== "negotiate" && host.phase !== "match") g.meetMp = null;   // the table never formed
  }
  else throw new Error("unknown meeting " + e.op);
}
function startHDuel(world, a, b, proposal) {
  const A = world.humans[a], B = world.humans[b], r = world.rng, da = deployed(A.caravan), db = deployed(B.caravan);
  const m = duelMatch({ rng: r, playerPersonal: da.personal, opponentPersonal: db.personal, value: cardValue, companion: da.companion,
    learnSuit: A.civ || null,   // seat 0 is always the challenger (D-534)
    opponentCompanion: db.companion,   // each player's own partner (D-1188; D-1231)
    names: [hname(A), hname(B), da.companion ? da.companion.name : `${hname(A)}'s companion`, db.companion ? db.companion.name : `${hname(B)}'s companion`], onPlay: onPlay(r), onTrick: onTrick(r, A.caravan.personal, A.caravan.cargo) });
  m.humanSeats = [0, 1];
  const duel = { a, b, proposal, m };
  A.meetMp = { kind: "h-duel", m, duel, me: 0 }; B.meetMp = { kind: "h-duel", m, duel, me: 1 };
  hnote(A, `A duel with ${hname(B)}: your ${hstake(proposal.yours)} against their ${hstake(proposal.theirs)}.`, "event");
  hnote(B, `A duel with ${hname(A)}: your ${hstake(proposal.theirs)} against their ${hstake(proposal.yours)}.`, "event");
  settle(m);
}
function finishHDuel(world, seat) {
  const mt = world.humans[seat].meetMp; if (mt?.kind !== "h-duel" || !mt.m.ended) throw new Error("no finished duel");
  const { a, b, proposal, m } = mt.duel, A = world.humans[a], B = world.humans[b], o = duelOutcome(m);
  for (const [P, tm, won] of [[A, 0, o.result === "win"], [B, 1, o.result === "lose"]]) if (P.run) { P.run.tricks += m.history.filter((t) => t.team === tm).length; if (won) P.run.games += 1; }   // D-416; D-1239
  const move = (from, to, st) => { for (const x of st.cards || []) { const i = from.cargo.indexOf(x); if (i >= 0) { from.cargo.splice(i, 1); to.cargo.push(x); } } const k = Math.min(from.coins, st.coins || 0); from.coins -= k; to.coins += k; };
  if (o.result === "win") move(B.caravan, A.caravan, proposal.theirs);
  if (o.result === "lose") move(A.caravan, B.caravan, proposal.yours);
  A.caravan.lastMatch = o.result; B.caravan.lastMatch = o.result === "win" ? "lose" : o.result === "lose" ? "win" : "draw";
  const txt = (w) => `Duel over: ${o.pts[0]}–${o.pts[1]} in confrontation points. ${o.result === "draw" ? "A friendly handshake: both keep their stakes." : w ? "You win the wager." : "You lose your stake."}`;
  hnote(A, txt(o.result === "win"), o.result === "lose" ? "bad" : "good"); hnote(B, txt(o.result === "lose"), o.result === "win" ? "bad" : "good");
  A.meetMp = null; B.meetMp = null;
  saddlebag(A, A.caravan, B.caravan, (t) => hnote(A, t, "good")); saddlebag(B, B.caravan, A.caravan, (t) => hnote(B, t, "good"));
  checkRun(A); checkRun(B);                               // below 8 cargo cards, a player's run ends (D-138, D-205)
  afterDuel(A); afterDuel(B);                             // an overfilled wagon: the overflow step, then Scavenging (D-265, D-493; D-1217)
}

// the round machine: resolve when everyone on the road has declared; wait on a human whose move opened something
function advance(world) {
  for (let guard = 0; guard < 50; guard++) {
    if (world.queue) {
      if (world.waiting) { const w = world.waiting; if (!w.ended && options(w).phase !== "declare") return; world.waiting = null; }
      const s = world.queue.shift();
      if (!s) { world.queue = null; startOfRound(world); continue; }
      if (s.ended) continue;
      if (s.ai) { world.player = world.humans[0]; stepAI(s); continue; }
      world.player = s; const a = s.declared; s.declared = null;
      if (a && !s.meetMp && options(s).phase === "declare") act(s, a);
      if (!s.ended && options(s).phase !== "declare") { world.waiting = s; return; }
      continue;
    }
    const L = living(world);
    if (!L.length) return;
    if (L.every((h) => h.declared && !h.meetMp && options(h).phase === "declare")) { world.queue = order(world); continue; }
    return;
  }
}
// at the start of each round, an AI caravan a human has met may challenge them (as in solo; seat order)
function startOfRound(world) {
  for (const h of world.humans) if (!h.ended && !h.meetMp && options(h).phase === "declare") { world.player = h; aiChallenges(world); }
  world.player = world.humans[0];
}
function order(world) {
  const all = [...world.humans.filter((h) => !h.ended), ...world.ais.filter((s) => !s.ended)];
  // False Identity (Bandits IX, refined, personal deck) departs a POI last, as in solo (D-678 B2)
  const fi = (s) => s.stops[s.caravan.at]?.kind === "poi" && s.caravan.personal.some(BANDITS.papers);
  const group = (s) => (fi(s) ? 3 : s.caravan.lastMatch === "lose" ? 0 : s.caravan.lastMatch === "win" ? 2 : 1);
  return all.map((s) => ({ s, k: group(s) * 10 + world.rng.next() })).sort((a, b) => a.k - b.k).map((x) => x.s);
}

// ---------------------------------------------------------------- regions
/** every human has finished this region (passed or out) and no round is resolving */
export const regionDone = (world) => !world.queue && world.humans.every((h) => h.ended);
export const crossing = (world) => world.humans.find((h) => h.ended?.crossing)?.ended.crossing ?? null;
export function applyRegion(world, board) {
  const saved = idCounter(); idCounter(world.nextId);
  try { regionInner(world, board); } finally { world.nextId = idCounter(); idCounter(saved); }
}
function regionInner(world, board) {
  world.entries++; world.player = world.humans[0];
  finishRegion(world);
  const pass = world.humans.filter((h) => h.ended?.won && h.ended.crossing);
  if (!pass.length) return;
  for (const h of pass) { h.declared = null; h.meetMp = null; enterRegion(h, board); }
  const lead = pass[0];
  for (const h of pass.slice(1)) { h.round = lead.round; share(h, lead); h.discovered = lead.discovered; }   // D-738
  for (const st of world.ais) {
    if (!(st.ended && st.ended.won && st.ended.crossing)) continue;
    st.round = lead.round; enterRegion(st, board); st.gone = false; st.ai.result = null; share(st, lead);
  }
  world.queue = null; world.waiting = null;
  startOfRound(world);
}
