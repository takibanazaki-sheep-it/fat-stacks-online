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
// NOT YET (first playable version): humans duelling, ambushing or trading with each other, humans sharing a match table (D-825
// (6) shared matches), AI caravans meeting a human other than the one whose turn it is. Every human gets AI challenges at the
// start of their own round as in solo.
import { newGame, enterRegion, options, act } from "./engine.js";
import { START_CIVS, stepAI, finishRegion, aiChallenges, challenge, answer, payToll, trade, ambushCaravan, finishDuel } from "./world.js";
import { legal, act as zact, aiChoose, idCounter } from "./zsir.js";
import { makeRng } from "./rng.js";
import { BANDITS } from "./abilities.js";

const NAMES = { Farmfolk: "the farmers' caravan", Clergy: "the pilgrims' caravan", Forestfolk: "the foresters' caravan", Tradesfolk: "the merchants' caravan" };
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
  for (const st of hs.slice(1)) share(st, lead);
  const profiles = PROFILES.slice(); for (let i = profiles.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [profiles[i], profiles[j]] = [profiles[j], profiles[i]]; }
  const used = new Set(humans.map((h) => h.civ));
  const ais = START_CIVS.filter((c) => !used.has(c)).slice(0, Math.max(0, 4 - humans.length)).map((civ, k) => {
    const st = newGame(board, seed * 101 + k + 1, mode, { civ }); share(st, lead);
    st.ai = { civ, profile: profiles[k], name: NAMES[civ] || `the ${civ} caravan`, rng: makeRng(seed * 31 + k) };
    return st;
  });
  const world = { multi: true, humans: hs, ais, rng, player: lead, queue: null, waiting: null, entries: 0 };
  // a challenge, toll or trade belongs to the human it was offered to (world.meet is read and written for the acting seat)
  Object.defineProperty(world, "meet", { get() { return this.player.meetMp ?? null; }, set(v) { this.player.meetMp = v; }, enumerable: false });
  for (const st of [...hs, ...ais]) st.world = world;
  for (const st of hs) st.joiners = (me) => ais.filter((ai) => !ai.ended && ai.caravan.at === me.caravan.at && ["settlement", "poi"].includes(me.stops[me.caravan.at].kind)
    && ai.ai.rng.next() < { Trader: 0.5, Developer: 0.8, Smuggler: 0.6, Brawler: 1 }[ai.ai.profile]).slice(0, 3);
  startOfRound(world);
  world.nextId = idCounter(); idCounter(saved);
  return world;
}
function share(st, lead) { st.markets = lead.markets; st.fences = lead.fences; st.taverns = lead.taverns; st.sharedMarkets = true; st.requirement = lead.requirement; if (lead.castle) st.castle = lead.castle; }
const seatOf = (world, seat) => { const st = world.humans[seat]; if (!st) throw new Error(`no seat ${seat}`); world.player = st; return st; };
const living = (world) => world.humans.filter((h) => !h.ended);

// ---------------------------------------------------------------- encoding: entries carry indices, never object references
export function encodeMove(st, mv) { return { leg: st.board.legs.indexOf(mv.leg), payments: mv.payments || [] }; }
export function encodeZ(m, seat, a) { const o = { ...a }; if (a.card) { o.card = m.hands[seat].indexOf(a.card); if (o.card < 0) throw new Error("card not in hand"); } return o; }
const decodeZ = (m, seat, o) => (o.card == null ? o : { ...o, card: m.hands[seat][o.card] });
export function encodeStake(c, s) { return { cards: (s.cards || []).map((x) => c.cargo.indexOf(x)), coins: s.coins || 0 }; }
const decodeStake = (c, s) => ({ cards: s.cards.map((i) => c.cargo[i]), coins: s.coins });
/** the match a human is playing right now: a duel from a meeting, or the match at their location */
export function currentMatch(world, seat) {
  const st = world.humans[seat], mt = st.meetMp;
  if (mt?.m && !mt.m.ended) return mt.m;
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
    case "meet": meet(world, st, e); break;
    case "region": break;   // handled by applyRegion (the board comes with it)
    default: throw new Error("unknown entry " + e.k);
  }
  advance(world);
  // any match a human now sits in plays on to their first decision (AI seats move first when it's their lead)
  for (let s = 0; s < world.humans.length; s++) { const m = currentMatch(world, s); if (m) settle(m); }
}
// the AI seats of a match play on until a human seat is to move (seat 0 is always the human whose match it is)
export function settle(m) { for (let k = 0; k < 500 && !m.ended && legal(m).seat !== 0; k++) { const L = legal(m); zact(m, L.seat, aiChoose(m, L.seat)); } }
function meet(world, st, e) {
  const ai = e.ai != null ? world.ais[e.ai] : null;
  if (e.op === "challenge") challenge(world, ai, decodeStake(st.caravan, e.yours), decodeStake(ai.caravan, e.theirs));
  else if (e.op === "answer") answer(world, e.how, e.counter ? { yours: decodeStake(st.caravan, e.counter.yours), theirs: decodeStake(world.meet.ai.caravan, e.counter.theirs) } : null);
  else if (e.op === "toll") payToll(world, e.pay);
  else if (e.op === "trade") trade(world, e.ok);
  else if (e.op === "ambush") ambushCaravan(world, ai);
  else if (e.op === "finish-duel") finishDuel(world);
  else throw new Error("unknown meeting " + e.op);
  const m = world.meet?.m; if (m) settle(m);
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
  for (const h of pass.slice(1)) { h.round = lead.round; share(h, lead); }
  for (const st of world.ais) {
    if (!(st.ended && st.ended.won && st.ended.crossing)) continue;
    st.round = lead.round; enterRegion(st, board); st.gone = false; st.ai.result = null; share(st, lead);
  }
  world.queue = null; world.waiting = null;
  startOfRound(world);
}
