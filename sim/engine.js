// The overworld simulation for Milestone A (D-856 to D-861; turn sequence: docs/design/overworld-turn.md).
// It owns all state and rules. A decision-maker (the browser player now, AI later) only reads `options(state)` and
// sends one of those actions to `act(state, action)`. The engine never trusts the interface: every action is re-checked.
import { RULES, PLACEHOLDER, PLAYTEST, SZARAZ, SUITS, CIVILISATION, startingCargo, startingPersonal } from "./rules.js";
import { makeRng } from "./rng.js";
import * as temp from "./temporary.js";
import { locationMatch as zsirLocationMatch, checkpointMatch, checkpointOutcome, ambushMatch, ambushOutcome, friendlyMatch, score as zscore, card as zcard, setProgression } from "./zsir.js";
import * as E from "./encounters.js";
import { COMMODITY_STAGES } from "./commodity-data.js";
// the next refinement stage's name in a commodity's own line, or null at the end of the line
// "town or city" means Tier III Town / Tier IV City (D-392, D-763, D-766); a market town is Tier II
// ---- beneficial overworld rolls (D-378): Good Fortune (Lucky Horseshoe +5, Fine / Masterwork +15; one applies), Almighty
// Lard (+5, one instance) and Crooked (Dodgy dice +3 / +6 / +10, the best one) add points; combined bonuses on a roll are
// capped at +60 (D-598), or at +10 while Crooked is active (D-661). Never on trick abilities or unfavourable outcomes
export function rollBonus(c) {
  const gf = Math.max(0, ...c.personal.filter(ALT.lucky).map((x) => ((x.refined || 0) >= 1 ? 15 : 5)));
  const lard = c.personal.some(ALT.lard) ? 5 : 0;
  const dice = Math.max(0, ...c.personal.filter((x) => ALT.dice(x) && x.adjective === "Dodgy").map((x) => [3, 6, 10][x.refined || 0]));
  return Math.min(gf + lard + dice, dice ? 10 : 60) / 100;
}
const luck = (state, p) => p + rollBonus(state.caravan);
// Salt Cure (Preserving Rock Salt line in cargo, any stage): automated travel-triggered abilities (arrival included) that refine, swap or
// transform commodities don't act (D-581, D-654)
const salted = (state) => state.caravan.cargo.some(HILL.preserving);
// Tempering (Malleable Copper line in cargo; the best one): automatic refinement chances +5 / +5 / +10 points (D-585, D-654)
const temper = (state) => Math.max(0, ...state.caravan.cargo.filter(HILL.tempering).map((x) => (x.refined >= 2 ? 0.1 : 0.05)));
// Solitude (Ascetic Recluse line, personal deck; the best one): services and bribes 10 / 15 / 20 % cheaper while yours is the only
// caravan there, always so in this build (D-652)
const solitude = (c) => Math.max(0, ...c.personal.filter(HILL.ascetic).map((x) => [0.1, 0.15, 0.2][x.refined || 0]));
const isTownOrCity = (here) => here.tier === "town" || here.tier === "city";
// D-352: passive abilities stack at most twice unless the card says otherwise; D-260: settlement abilities at most twice
const two = (xs) => xs.slice(0, 2);
// highway fees are waived by Pilgrim's Papers (Highway Fee Exemption) and by The Power of Zsír (D-598: the same effect)
const aristocratic = (c, stage = 0) => c.personal.some((x) => FISH.egret(x) && x.adjective === "Aristocratic" && (x.refined || 0) >= stage);
const highwayExempt = (c) => clergyExempt(c) || c.personal.some(ALT.lard) || aristocratic(c);   // + Aristocratic Egret (D-578, D-469)
const COMMODITY_NEXT = (x) => { const line = E.lineOf(x); if (!line) return null;
  const n = COMMODITY_STAGES.find((s) => s.suit === x.suit && s.rank === x.rank && s.roster === (x.roster || "main") && s.stage === (x.refined || 0) + 1 && E.lineOf({ suit: s.suit, rank: s.rank, roster: s.roster, name: s.name }) === line);
  return n ? n.name : null; };
import * as N from "./negotiation.js";
import { drawScenario } from "./checkpoint-scenarios.js";
import { capacity, onPlay, onTrick, highwayExempt as clergyExempt, FARMFOLK, CLERGY, TRADES, PLAINS, TOWNS, CARNIVAL, BANDITS, BEASTS, KINGS, ALT, RURAL, RURAL_T, AGRI, FOREST, HILL, FISH, conscript, FARMFOLK_IX, CLERGY_IX } from "./abilities.js";
import { offers, apply as applyUpgrade, CHURCH_NOTE, entry as upgradeEntry, upgradedName } from "./upgrades.js";
import { MERCS, MERC, mercCard, mercDeck, mercOf } from "./mercs.js";

export function newGame(board, seed = 1, mode = "normal", opts = {}) {
  const rng = makeRng(seed);
  const stops = Object.fromEntries(board.stops.map((s) => [s.id, s]));
  const legsFrom = {};
  for (const l of board.legs) (legsFrom[l.from] ??= []).push(l);
  const state = {
    board, stops, legsFrom, seed, rng, mode,
    round: 1,
    caravan: {
      at: board.entry, onHighway: false,          // the Entry gate: entering the highway there pays (D-837)
      coins: PLACEHOLDER.startingCoins, cargo: startingCargo(opts.civ), personal: startingPersonal(opts.civ, opts.civ && upgradeEntry({ rank: "IX", suit: opts.civ })),
      emergency: null, usedEmergency: false,
    },
    phase: "declare", pending: null, visited: new Set([board.entry]), discovered: new Set(),
    log: [], ended: null, markets: {},
    run: { earned: 0, spent: 0, tricks: 0, games: 0, regions: [], titles: [] },   // the run's score inputs (D-416, D-748); titles unlocked (D-740)
    captureBonus: opts.captureBonus || 0,                    // the hideout's permanent capture-quality upgrade (D-418)
  };
  state.caravan.capacity = capacity(state.caravan);      // Farmer's Papers in the personal deck: 40 (D-714, D-744)
  setupRegion(state, board, opts);
  return state;
}

// ---------------------------------------------------------------- the run across regions (D-326, D-430, D-455, D-458)
// Everything in the caravan carries over (coins, cargo, personal deck, mercenaries and partner, investments, D-659); the region's
// places, stock, requirement and its once-per-checkpoint emergency return are new (D-143); Goodwill's count restarts (D-370);
// a passenger leaves at the border (D-421). Regions 2-7 start at the entry checkpoint, the previous exit (D-452, D-458), with
// no second inspection there (D-455); the AI caravans that passed come too (your ruling, 2026-11-05)
export function enterRegion(state, board, opts = {}) {
  const c = state.caravan;
  state.board = board; state.stops = Object.fromEntries(board.stops.map((s) => [s.id, s]));
  state.legsFrom = {}; for (const l of board.legs) (state.legsFrom[l.from] ??= []).push(l);
  c.at = board.entry; c.onHighway = false; c.emergency = null; c.usedEmergency = false;
  if (c.passenger) { note(state, "Your passenger gets down at the border with thanks."); c.passenger = null; }
  Object.assign(state, { phase: "declare", pending: null, visited: new Set([board.entry]), discovered: new Set(), ended: null, markets: {},
    event: null, match: null, ambush: null, ambushRival: null, recruit: null, nego: null, loot: null, inspection: null, afterOverflow: null,
    cpTrader: null, cpBribery: null, reqBribed: 0, refusedGuard: false, sabotage: false, sabotageRolled: false, foreseen: {}, goodwillVisits: 0, waterLegs: {}, trailUsed: null, mercShop: {}, final: false });
  c.capacity = capacity(c);
  setupRegion(state, board, opts);
}
const regionNo = (state) => state.board.region || 1;

// Checkpoint sabotage (Sinister Assassination Tools, cargo or personal deck): once per checkpoint, on arrival, 5 % (a beneficial
// roll: Good Fortune, Lard and Crooked add, D-641) that the requirement asks for one card fewer (your ruling: "checkpoint
// difficulty" is the requirement count, D-940); doesn't stack
function sabotage(state) {
  const c = state.caravan;
  if (state.sabotageRolled || ![...c.cargo, ...c.personal].some((x) => ALT.dagger(x) && x.adjective === "Sinister" && x.refined >= 2)) return;
  state.sabotageRolled = true;
  if (state.rng.next() < luck(state, 0.05)) { state.sabotage = true; note(state, "Sabotage: someone has been at the guards' orders in the night. They ask for one card fewer.", "good"); }
}
function setupRegion(state, board, opts = {}) {
  const rng = state.rng;
  tagHome(state);
  // Region 8 ends at Castle Town, a proper terminal town and not a checkpoint (D-431, D-757): a Tier IV city whose suits are
  // Townsfolk, King's Men and Clergy plus a variable fourth (D-444); the Royal Castle beyond it holds the final inspection (D-432)
  if ((board.region || 1) === 8) { const ct = board.stops.find((s) => s.id === board.checkpoint);
    if (ct && ct.kind === "checkpoint") { const fourth = (ct.suits || []).filter((x) => !["Townsfolk", "King's Men", "Clergy"].includes(x));
      Object.assign(ct, { kind: "settlement", castleTown: true, tier: "city", name: `${ct.name} (Castle Town)`, suits: ["Townsfolk", "King's Men", "Clergy", fourth.length ? rng.pick(fourth) : rng.pick(ALL_SUITS_)] }); } }
  // the Capital Region holds at least one Fence (D-445), in Castle Town or another settlement; Castle Town isn't guaranteed one
  if ((board.region || 1) === 8 && !board.stops.some((s) => s.kind === "settlement" && (s.services || []).includes("Fence"))) {
    const s = rng.pick(board.stops.filter((x) => x.kind === "settlement")); s.services = [...(s.services || []), "Fence"]; }
  // Markets: every settlement has one (D-816); stock = commodities of the suits present (D-825 (5)), never Rank X (D-663);
  // demand indicators known on entering the region (D-715); sizes, refresh and demand draws are PLACEHOLDERS (SET-05, SET-11)
  const allSuits = [...new Set([...SUITS, ...board.stops.flatMap((s) => s.suits || [])])];
  // a monastery works like a Tier I village (D-724, D-725): it gets a village's merchant (D-816); other services not built
  for (const s of board.stops) if (s.kind === "poi" && s.poi === "monastery" && !(s.services || []).includes("Market")) { s.services = [...(s.services || []), "Market"]; s.tier = s.tier || "village"; }
  for (const s of board.stops) if ((s.kind === "settlement" || (s.kind === "poi" && s.poi === "monastery")) && (s.services || []).includes("Market")) {
    const suits = s.suits?.length ? s.suits : SUITS;
    const up = rng.pick(allSuits); let down = rng.pick(allSuits); if (down === up) down = null;
    const m = { suits, tier: s.tier, beastsRoster: s.beasts_roster, demand: { up, down }, size: PLACEHOLDER.stockSize[s.tier] || 2, stock: [] };
    while (m.stock.length < m.size) m.stock.push(commodity(rng, m));
    state.markets[s.id] = m;
  }
  // Taverns (D-393, D-816 (3)): each offers one of the four mercenaries for hire (which one PLACEHOLDER: at random; rarity is a balance
  // value, MER-03) and sells upgrade packages for the ones you own
  state.taverns = {};
  for (const s of board.stops) if ((s.kind === "settlement" || s.kind === "poi") && (s.services || []).includes("Tavern")) { const tv = { offer: rng.pick(MERCS).id, food: [], suits: s.suits || [] }; while (tv.food.length < PLACEHOLDER.enc.innStock) tv.food.push(tavernFood(rng, tv)); state.taverns[s.id] = tv; }
  // Fences (D-112, D-812, D-663; settlements.md): a stock of illicit goods, now and then a Rank X; blind bins sold sight unseen
  state.fences = {};
  for (const s of board.stops) if (s.kind === "settlement" && (s.services || []).includes("Fence")) { const f = { stock: [] }; while (f.stock.length < PLACEHOLDER.fence.stock) f.stock.push(fenceGood(rng)); state.fences[s.id] = f; }
  note(state, (board.region || 1) === 1 ? `Region ${board.region}: ${board.region_name}. The run starts at its starting point (D-160, D-458) with ${state.caravan.coins} coins and ${state.caravan.cargo.length} cargo cards.`
    : `Region ${board.region}: ${board.region_name}. You cross the border with ${state.caravan.coins} coins and ${state.caravan.cargo.length} cargo cards.`, "event");
  // the checkpoint's requirement: a scenario drawn for this region, revealed now (D-106, D-875); Region 1: the standard tier
  const regionSuits = [...new Set(board.stops.filter((s) => s.kind === "settlement" || s.kind === "poi").flatMap((s) => s.suits || []))];
  const marketSuits = [...new Set(Object.values(state.markets).flatMap((m) => m.suits))];
  state.reqCtx = { rng, regionSuits, marketSuits, civilisation: state.civ ??= (opts.civ || CIVILISATION), region: board.region || 1, final: (board.region || 1) === 8, markets: Object.values(state.markets) };   // Region 8: the Royal Castle's demand, known on entering (D-715)
  state.requirement = drawScenario(state.reqCtx, opts.req);
  note(state, `Checkpoint requirement: ${state.requirement.title}: ${state.requirement.ask}, across cargo and personal deck (D-875, D-735).`);
  if (state.mode === "playtest") note(state, `PLAYTEST MODE: the checkpoint uses a temporary condition instead. ${PLAYTEST.label}.`, "temp");
  if (regionNo(state) === 8) castlePreferences(state);
}

function note(state, text, kind = "info") { state.log.push({ round: state.round, text, kind }); }
// Hidden Extras (Dubious Bandits VIII, Plunder line): each time it's refined, 50 % for an ordinary Plunder in cargo, space
// permitting; wherever the card is (D-317)
function afterRefine(state, card) {
  const c = state.caravan;
  // Secret Lard: when Pork is refined into Kolbász, an independent hard 5 % for one Lard (D-595, D-643, D-646)
  if (ALT.pig(card) && card.refined === 2 && state.rng.next() < 0.05 && slots(c) < c.capacity) {
    c.cargo.push({ rank: "X", suit: "Plainsfolk", roster: "secret alternative", name: "Lard" }); note(state, "...and in the back of the smokehouse: a tin of Lard. An essential commodity.", "good");
  }
  // Second Harvest (Steadfast Millet): each refinement, 50 % for a basic Millet in cargo, space permitting; the copy doesn't
  // trigger it (D-560)
  if (ALT.millet(card) && card.adjective === "Steadfast" && state.rng.next() < luck(state, 0.5)) {
    if (slots(c) < c.capacity) { c.cargo.push({ rank: "VIII", suit: "Farmfolk", roster: "alternative", name: "Millet" }); note(state, "Second Harvest: a second crop of Millet.", "good"); }
  }
  // Refinement Jackpot (King's Men VIII: a Keepsakes refining into Heirloom, or any King's Men VIII refining while you hold an
  // Heirloom): 5 % for a random X or Ász of any suit in cargo (D-629, D-651, D-656)
  if (card.suit === "King's Men" && card.rank === "VIII" && (KINGS.heirloom(card) && (!card.roster || card.roster === "main") || [...c.cargo, ...c.personal].some((x) => x !== card && KINGS.heirloom(x)))) {
    if (state.rng.next() < luck(state, 0.05)) { const g = { rank: state.rng.pick(["X", "Ász"]), suit: state.rng.pick(ALL_SUITS_) };
      if (slots(c) < c.capacity) { c.cargo.push(g); note(state, `Refinement Jackpot! ${cardName(g)} turns up.`, "good"); } }
  }
  if (!BANDITS.dubious(card)) return;
  if (state.rng.next() < luck(state, 0.5)) { if (slots(c) < c.capacity) { c.cargo.push({ rank: "VIII", suit: "Bandits", name: "Plunder", roster: "main" }); note(state, "Hidden Extras: a bag of Plunder turns up in the goods.", "good"); }
    else note(state, "Hidden Extras: some Plunder turns up, but the wagon is full (D-736).", "warn"); }
}

// ---------------------------------------------------------------- fees (D-837, D-818, D-824 (4), D-860)
export function feesFor(state, leg) {
  const fees = []; let on = state.caravan.onHighway;
  for (const seg of leg.segments) {
    if (seg.cls === "highway") {
      if (!on) fees.push(highwayToll(state));
      on = true;
    }
    else on = false;
    if (seg.cls === "water") fees.push({ kind: "water", amount: RULES.waterFare, label: "water fare" });
    if (seg.cls !== "highway") for (const x of seg.crossings || []) fees.push(state.caravan.personal.some(AGRI.ebborz)   // Tax Evasion: no fee, no cargo surrender (D-499)
      ? { kind: "crossing", amount: 0, label: `${x.type} crossing (waived: Tax Evasion)`, waived: true }
      : { kind: "crossing", amount: discounted(state.caravan, x.fee), label: `${x.type} crossing` });
  }
  return fees;
}

// A route is unavailable only if the caravan has neither the coins nor a cargo card for its fees (D-859 (2), D-860 (1)).
export function affordable(state, fees) {
  const amounts = fees.map((f) => f.amount).sort((a, b) => a - b);
  let coins = state.caravan.coins, cards = state.caravan.cargo.length;
  for (const a of amounts) { if (coins >= a) coins -= a; else if (cards > 0) cards -= 1; else return false; }
  return true;
}

// Default payment: coins while they last, cheapest fees first; cards for the rest.
export function defaultPayment(state, fees) {
  let coins = state.caravan.coins;
  const order = fees.map((f, i) => [f.amount, i]).sort((a, b) => a[0] - b[0]);
  const pay = new Array(fees.length).fill("card");
  for (const [a, i] of order) if (coins >= a) { pay[i] = "coins"; coins -= a; }
  return pay;
}

// ---------------------------------------------------------------- what the decision-maker may do now
export function options(state) {
  trader = state.caravan;
  const c = state.caravan, here = state.stops[c.at];
  if (state.ended) return { phase: "ended", ended: state.ended };
  if (state.phase === "match-offer") return { phase: "match-offer", here, actions: [{ type: "accept" }, { type: "decline" }] };
  if (state.phase === "loot") return { phase: "loot", here, rival: state.loot.rival.ai.name, actions: [...state.loot.cards.map((card, i) => ({ type: "take", i, card, allowed: slots(c) < c.capacity })), { type: "done-loot" }] };
  if (state.phase === "recruit") return { phase: "recruit", here, eligible: state.recruit.eligible, personal: c.personal,
    actions: [...state.recruit.eligible.flatMap((card, i) => [{ type: "recruit", i }, ...c.personal.map((_, j) => ({ type: "recruit", i, swap: j }))]), { type: "skip-recruit" }] };
  if (state.phase === "event") return eventOptions(state);
  if (state.phase === "negotiate") return { here, ...negotiationOptions(state) };
  if (state.phase === "breakaway") return { phase: "breakaway", ambush: state.ambush, chance: state.ambush.breakaway, actions: [{ type: "breakaway", chance: state.ambush.breakaway }, { type: "stand" }] };
  if (state.phase === "expose") {
    const a = state.ambush;
    return { phase: "expose", here, ambush: a, groups: a.groups, need: a.needP - a.picked.length, seconds: PLACEHOLDER.enc.exposeSeconds,
             actions: [...a.groups.map((g, i) => ({ type: "expose-pick", i })), { type: "expose-timeout" }] };
  }
  if (state.phase === "guard") return { phase: "guard", here, bribe: guardBribe(state),
    actions: [{ type: "pay-guard", allowed: c.coins >= guardBribe(state) }, { type: "refuse-guard" }] };
  if (state.phase === "discovery") return { phase: "discovery", here, inspection: state.inspection,
    actions: [{ type: "fight" }, { type: "surrender" }, ...inspectionBribes(state),
      // Ornamental Plumage (Aristocratic, personal deck): give it up to skip the checkpoint encounter, before Region 8 (D-579)
      ...(c.personal.some((x) => FISH.egret(x) && x.adjective === "Aristocratic" && x.refined >= 2) && (state.board.region || 1) < 8 ? [{ type: "plumage" }] : [])] };
  if (state.phase === "match") return { phase: "match", here, match: state.match.m, actions: state.match.m.ended ? [{ type: "match-done" }] : [] };
  if (state.phase === "overflow") {
    // D-265 overflow; at a settlement the excess can be sold at its market instead of left behind (D-112, D-874)
    const mk = state.markets[c.at] || null;   // settlements and monasteries (D-874)
    return { phase: "overflow", here, capacity: c.capacity, excess: slots(c) - c.capacity, market: !!mk,
             actions: c.cargo.flatMap((card, i) => [{ type: "discard", i, card, bundle: mates(c, card).length }, ...(mk ? [{ type: "sell-excess", i, card, bundle: mates(c, card).length, price: priceOf(c, card, (x) => sellPrice(mk, x)) }] : [])]) };
  }
  if (state.phase === "location") {
    const m = state.markets[c.at], acts = [{ type: "leave" }];
    if (m) {
      m.stock.forEach((card, i) => acts.push({ type: "buy", i, card, price: buyPrice(m, card), allowed: c.coins >= buyPrice(m, card) && slots(c) < c.capacity }));
      c.cargo.forEach((card, i) => acts.push({ type: "sell", i, card, bundle: mates(c, card).length, price: priceOf(c, card, (x) => sellPrice(m, x)), endsRun: counted(c) - countedOut(mates(c, card)) < RULES.cargoMinimum }));
      acts.push({ type: "restock", price: RULES.restockFee, allowed: c.coins >= RULES.restockFee });
    }
    acts.push(...profiteerShop(state, "shop"));
    // the Tavern (D-393): hire its mercenary, buy the next upgrade package for one you own, or sell one (prices PLACEHOLDER, MER-03)
    const tv = state.taverns?.[c.at];
    if (tv) {
      const P = PLACEHOLDER.merc, owned = c.personal.filter((x) => x.merc);
      if (!owned.some((x) => x.merc === tv.offer)) acts.push({ type: "hire", merc: tv.offer, card: mercCard(tv.offer), price: P.hire, allowed: c.coins >= P.hire });
      tv.food.forEach((card, i) => { const price = Math.ceil(cardValue(card) * RULES.marketBuy * PLACEHOLDER.enc.innMarkup); acts.push({ type: "tavern-buy", i, card, price, allowed: c.coins >= price && slots(c) < c.capacity }); });
      for (const x of owned) {
        if (x.stage < 3) acts.push({ type: "merc-upgrade", merc: x.merc, card: x, next: MERCS.find((y) => y.id === x.merc).stages[x.stage + 1], price: P.packages[x.stage], allowed: c.coins >= P.packages[x.stage] });
        acts.push({ type: "merc-sell", merc: x.merc, card: x, price: Math.ceil(P.hire * P.resale) });
      }
    }
    // the Banking House (D-659, D-746): invest, add, withdraw principal (in part or whole), close; the Guild pays the dividends (D-825)
    const inv = c.investment || { principal: 0, uncollected: 0 };
    if ((here.services || []).includes("Banking House")) {
      acts.push({ type: "invest", max: c.coins, allowed: c.coins > 0 });
      if (inv.principal > 0) acts.push({ type: "withdraw", max: inv.principal, allowed: true }, { type: "close-investment", allowed: true });
    }
    if ((here.services || []).includes("Guild") && inv.uncollected > 0) acts.push({ type: "collect-dividends", amount: Math.ceil(inv.uncollected), allowed: true });
    // the Fence: blind bins, its counter of illicit goods (and now and then an X), and buying your illicit goods (D-812 (2))
    const f = state.fences?.[c.at];
    if (f) {
      acts.push({ type: "fence-bin", price: PLACEHOLDER.fence.binPrice, size: PLACEHOLDER.fence.binSize, allowed: c.coins >= PLACEHOLDER.fence.binPrice });
      f.stock.forEach((card, i) => { const price = Math.max(1, buyRound(here.suits, card)(cardValue(card) * buyMult(here.suits, card) * INFL)); acts.push({ type: "fence-buy", i, card, price, allowed: c.coins >= price && slots(c) < c.capacity }); });
      c.cargo.forEach((card, i) => { if (illicit(card)) acts.push({ type: "fence-sell", i, card, price: Math.max(1, Math.round(cardValue(card) * sellMult(here.suits, card) * INFL)), endsRun: counted(c) - 1 < RULES.cargoMinimum }); });
      // smuggled valuables (D-417): foreign-origin X and Ász, after crossing into another region
      c.cargo.forEach((card, i) => { if ((card.rank === "X" || card.rank === "Ász") && card.home != null && card.home !== regionNo(state))
        acts.push({ type: "fence-smuggle", i, card, from: card.home, distance: smuggleDistance(card.home, regionNo(state)), price: smugglePrice(state, card), endsRun: counted(c) - 1 < RULES.cargoMinimum }); });
    }
    // upgrade services (D-112, D-113, D-302, D-620; subset and DRAFT prices in upgrades.js): your cards in cargo or the personal deck
    const services = here.services || [];
    // Cheap Labour (Industrious Tradesfolk Alsó in the personal deck) cuts Guild refinement; Special Treatment cuts all upgrades
    const labour = c.personal.some(TRADES.industrious) ? PLACEHOLDER.cheapLabour : 0;
    // Beast of Burden at Grey Cattle: settlement services 10 % cheaper where Plainsfolk live (not commodity prices)
    // Local Discount (Citizenship Papers): paid settlement services in towns and cities, at most two copies (D-260)
    const local = isTownOrCity(here) ? Math.min(2, c.personal.filter(TOWNS.citizen).length) * PLACEHOLDER.localDiscount : 0;
    const cattle = local + ((here.suits || []).includes("Plainsfolk") && c.personal.some((x) => PLAINS.burden(x) && x.refined >= 2) ? 0.1 : 0);
    // Tempting Trade (Cured Beaver Pelt / Beaver Fur, personal deck; the best one): refinement 10 / 15 % cheaper where no Forestfolk live (D-591)
    const tempt = (here.suits || []).includes("Forestfolk") ? 0 : Math.max(0, ...c.personal.filter((x) => FOREST.beaver(x) && x.refined >= 1).map((x) => (x.refined >= 2 ? 0.15 : 0.1)));
    for (const deck of ["cargo", "personal"]) c[deck].forEach((card, i) => offers(card, services).forEach((o) => {
      // Forge Discount (Thrifty Blacksmith line, personal deck): refining Hillfolk VIII and X 30 % cheaper
      const net = card.suit === "Fisherfolk" && c.personal.some(FISH.canny) ? 0.2 : 0;   // Networking (Canny Helmsman line; ABL-21: one copy)
      const forge = o.track === "refine" && card.suit === "Hillfolk" && (card.rank === "VIII" || card.rank === "X") && c.personal.some(HILL.thrifty) ? 0.3 : 0;
      const price = discounted(c, Math.ceil(o.price * INFL), cattle + solitude(c) + forge + net + (o.track === "refine" && o.at === "Guild" ? labour : 0) + (o.track === "refine" ? tempt : 0));
      acts.push({ type: "upgrade", deck, i, card, ...o, price, listPrice: o.price, allowed: c.coins >= price });
    }));
    // the Church sells Attrition (D-302, D-726): a rank-standard ability for one card, played sideways (D-101); price PLACEHOLDER
    if (services.includes("Church")) for (const deck of ["cargo", "personal"]) c[deck].forEach((card, i) => {
      const price = discounted(c, PLACEHOLDER.churchAttrition, cattle + solitude(c));
      if (!card.attrition) acts.push({ type: "attrition", deck, i, card, price, allowed: c.coins >= price });
    });
    if (here.castleTown) { acts.push({ type: "royal-castle" }); acts.splice(acts.findIndex((x) => x.type === "leave"), 1); }   // every journey ends here (D-757)      // the final inspection (D-432): only from Castle Town (D-442)
    return { phase: "location", here, services, market: m, actions: acts, church: services.includes("Church") };
  }
  if (state.phase === "checkpoint") {
    const acts = [{ type: "submit" }, ...briberyOffers(state)];
    const rb = requirementBribe(state); if (rb) acts.push(rb);
    // the emergency return (D-109, D-719): always shown, with the reason when it can't be taken (D-119). It costs its two
    // highway tolls, 5 + 5, paid in COINS ONLY: card substitution (D-860) doesn't apply to this special action (D-871 (1),
    // D-323); toll abilities apply by their own text
    { const target = emergencyTarget(state), cost = emergencyCost(state);
      const why = c.usedEmergency ? "already used this region" : !target ? "no settlement on the highway before this checkpoint"
                : c.coins < cost ? `it needs ${cost} coins; you have ${c.coins}` : null;
      acts.push({ type: "emergency", cost, toll: highwayToll(state), target: target && state.stops[target].name, allowed: !why, why, cards: 0 }); }
    // the Checkpoint Trader (D-376, character D-121): a last resort; trading isn't waiting, no round passes
    const T = PLACEHOLDER.checkpointTrader;
    (state.cpTrader ||= []).forEach((card, i) => { const price = Math.ceil(cardValue(card) * T.sellMult); acts.push({ type: "cp-buy", i, card, price, allowed: c.coins >= price && slots(c) < c.capacity, why: c.coins < price ? `you have ${c.coins} coins` : slots(c) >= c.capacity ? "the wagon is full" : null }); });
    c.cargo.forEach((card, i) => acts.push({ type: "cp-sell", i, card, bundle: mates(c, card).length, price: priceOf(c, card, (x) => Math.max(1, Math.floor(cardValue(x) * T.buyMult))), endsRun: counted(c) - countedOut(mates(c, card)) < RULES.cargoMinimum }));
    acts.push(...profiteerShop(state, "checkpoint"));
    return { phase: "checkpoint", here, requirement: requirementStatus(state), actions: acts };   // no waiting (D-859 (7))
  }
  // declare: every leg from here; an emergency return forces the way back to the checkpoint (D-109)
  let legs = state.legsFrom[c.at] || [];
  if (c.emergency) legs = legs.filter((l) => l.to === state.board.checkpoint);
  // Light the Way (Guiding Townsfolk VIII in cargo): the encounter waiting at each encounter point ahead is known before
  // choosing (drawn now, kept until arrival)
  const lit = c.cargo.some(TOWNS.guiding);
  const moves = legs.map((leg) => {
    const fees = c.emergency ? [] : feesFor(state, leg);     // the way back is covered by the emergency return's 10 coins (D-323)
    const to = state.stops[leg.to];
    const foreseen = lit && to.kind === "encounter" ? foresee(state, to) : undefined;
    return { type: "move", leg, to, fees, available: affordable(state, fees), ...(foreseen !== undefined ? { foreseen } : {}) };
  });
  // Game Trails (Treebark in the personal deck): a lateral teleport to another stop with the same stop number, any distance;
  // no progress, no ordinary movement (D-693, D-698; D-420: chosen when departing). One lateral move, then a regular move;
  // the lateral move is no arrival (your ruling, 2026-11-04)
  // Waterways (Weatherwise Fowler line, personal deck): another way to the next stop: a stop of the next number with Fisherfolk that
  // no road from here reaches; no toll, no crossing fee (D-374, D-420, D-480, D-482)
  if (c.personal.some(FISH.weatherwise) && !c.emergency) {
    const reach = new Set(legs.map((l) => l.to)), next = state.board.stops.filter((s) => s.stop === here.stop + 1 && !reach.has(s.id) && s.kind !== "checkpoint" && (s.suits || []).includes("Fisherfolk"));
    state.waterLegs ||= {};
    for (const s2 of next) { const key = here.id + ">" + s2.id; const leg = (state.waterLegs[key] ||= { from: here.id, to: s2.id, segments: [{ cls: "water", crossings: [], cells: [here.cell, s2.cell] }], waterway: true });
      moves.push({ type: "move", leg, to: s2, fees: [], available: true, waterway: true }); }
  }
  const trails = c.personal.some(BEASTS.treebark) && !c.emergency && state.trailUsed !== here.stop
    ? parallelStops(state, here).map((to) => ({ type: "trail", to })) : [];
  return { phase: "declare", here, moves, trails };
}

// ---------------------------------------------------------------- actions
export function act(state, action) {
  const c = state.caravan, coins0 = c.coins, m = state.phase === "match" && state.match ? state.match.m : null;
  const out = actInner(state, action);
  // the run's tallies (D-416): money earned and spent (investing isn't spending and withdrawing isn't earning, D-748), tricks won
  // and matches won by your side
  if (state.run && !["invest", "withdraw", "close-investment"].includes(action.type)) { const d = c.coins - coins0; if (d > 0) state.run.earned += d; else state.run.spent -= d; }
  if (state.run && m && action.type === "match-done" && state.match?.m !== m) {
    state.run.tricks += (m.history || []).filter((t) => t.team === 0).length;
    if (m.result === "win" && state.match?.kind !== "checkpoint") state.run.games += 1;
  }
  tagHome(state);
  return out;
}
// every card's origin region (D-417, D-422): where it was obtained, bought or generated; starting cards: the starting region;
// refinements keep it. Cards that join the caravan are stamped with the region they joined in
function tagHome(state) {
  const r = state.board?.region || 1, c = state.caravan;
  for (const x of c.cargo) if (x.home == null) x.home = r;
  for (const x of c.personal) if (x.home == null) x.home = r;
}
// ---- regional progression of the opposition (D-450, D-406, D-797 (2)): NPC opponents' own decks (checkpoint King's Men, locals,
// ambushers, short-match opponents) go from no upgrades in Region 1 to fully upgraded in Region 8; the shared encounter decks
// become more developed too, their VIII / X / Ász share unchanged. Shares and levels are balance values (ENC-07, ENC-12):
// PLACEHOLDER.progression
const progress = (state) => (regionNo(state) - 1) / 7;
function upgradeFields(rng, rank, suit, x, p) {
  const c = { rank, suit, ...x }, e = upgradeEntry(c);
  if (!e || !(p > 0) || rng.next() >= p) return {};
  const max = e.stages.length - 1, refined = max ? Math.max(1, Math.round(p * max)) : 0;
  const adjective = e.adj && rng.next() < p ? e.adjective : null;
  if (!refined && !adjective) return {};
  const out = { ...(refined ? { refined } : {}), ...(adjective ? { adjective } : {}), ...(e.alt ? { line: e.stages[0] } : {}) };
  out.name = upgradedName({ ...c, ...out }); return out;
}
// price progression (D-658: sale, purchase, refinement and adjective prices rise by map; your placeholder 2026-11-05: +5 % per
// region passed, D-940); it applies to Markets, the peddler, the inn, the Fence's counter and the Guild / Magistrates upgrades
let INFL = 1;
const inflation = (state) => 1 + PLACEHOLDER.inflationPerRegion * (regionNo(state) - 1);
function setRegionProgression(state) {
  INFL = inflation(state);
  const p = progress(state), P = PLACEHOLDER.progression, r = state.rng;
  setProgression((rank, suit) => upgradeFields(r, rank, suit, {}, p * P.npc), (rank, suit, x) => upgradeFields(r, rank, suit, x, p * P.deck));
}
function actInner(state, action) {
  setRegionProgression(state);
  if (action.type === "merc-shop") return buyFromProfiteer(state, options(state), action);
  // choosing your partner for the coming encounters: the companion (null) or a mercenary you own (D-156, D-199)
  if (action.type === "set-partner") { const c = state.caravan; if (action.merc != null && !c.personal.some((x) => x.merc === action.merc)) throw new Error("not your mercenary"); c.partner = action.merc ?? null; return; }
  trader = state.caravan;
  const opts = options(state);
  if (opts.phase === "ended") return;
  const c = state.caravan;
  if (opts.phase === "declare" && action.type === "move") return move(state, opts, action);
  if (opts.phase === "match-offer" && (action.type === "accept" || action.type === "decline")) return locationMatch(state, action.type === "accept");
  if (opts.phase === "loot" && action.type === "take") {
    const a = opts.actions.find((x) => x.type === "take" && x.i === action.i); if (!a || !a.allowed) throw new Error("no room");
    const [card] = state.loot.cards.splice(action.i, 1); state.caravan.cargo.push(card); note(state, `Looted ${cardName(card)}.`); return;
  }
  if (opts.phase === "loot" && action.type === "done-loot") { if (state.loot.cards.length) note(state, `Left behind: ${state.loot.cards.length} card${state.loot.cards.length === 1 ? "" : "s"}.`); state.loot = null; state.phase = "declare"; return; }
  if (opts.phase === "match" && action.type === "match-done" && opts.actions.length)
    return state.match.kind === "checkpoint" ? finishCheckpointMatch(state) : state.match.kind === "ambush" ? finishAmbush(state)
         : state.match.kind === "friendly" ? finishFriendly(state) : finishMatch(state);
  if (opts.phase === "event") return eventAct(state, opts, action);
  if (opts.phase === "negotiate") return negotiationAct(state, opts, action);
  if (opts.phase === "breakaway" && action.type === "breakaway") {
    if (state.rng.next() < luck(state, state.ambush.breakaway)) { note(state, `Breakaway! You ride clear of the ${state.ambush.kind}: avoided, not won.`, "good"); state.ambush = null; return roadDone(state); }
    note(state, "Breakaway fails: you'll have to face them.", "warn"); return continueAmbush(state);
  }
  if (opts.phase === "breakaway" && action.type === "stand") return continueAmbush(state);
  if (opts.phase === "expose" && action.type === "expose-pick" && state.ambush.groups[action.i]) return exposePick(state, action.i);
  if (opts.phase === "expose" && action.type === "expose-timeout") return exposeTimeout(state);
  if (opts.phase === "recruit" && action.type === "recruit") return recruit(state, action);
  if (opts.phase === "recruit" && action.type === "skip-recruit") { const { after } = state.recruit; state.recruit = null; return after(); }
  if (opts.phase === "guard" && action.type === "pay-guard" && opts.actions[0].allowed) return payGuard(state);
  if (opts.phase === "guard" && action.type === "refuse-guard") { state.refusedGuard = true; note(state, "You refuse the guard. A standard 3-card inspection follows (D-168)."); return inspect(state, 3, 1); }
  if (opts.phase === "discovery" && action.type === "fight") return fight(state);
  if (opts.phase === "discovery" && action.type === "plumage") {
    const c = state.caravan, k = c.personal.findIndex((x) => FISH.egret(x) && x.adjective === "Aristocratic" && x.refined >= 2); if (k < 0) throw new Error("no plumage");
    c.personal.splice(k, 1); c.capacity = capacity(c);
    note(state, "Aristocratic: you hand over the Ornamental Plumage; the guards bow and let a noble caravan pass, no questions about the finds (D-579).", "good");
    return pass(state, "The plumage opens the barrier.");
  }
  if (opts.phase === "discovery" && action.type === "bribe") {
    const a = opts.actions.find((x) => x.type === "bribe" && x.share === action.share); if (!a) throw new Error("no bribe");
    if (state.rng.next() < Math.min(1, luck(state, a.chance))) { state.caravan.coins -= a.amount; note(state, `The inspector pockets ${a.amount} coins and looks away (bribe accepted, D-136).`, "good"); return pass(state, "Bribed through."); }
    note(state, `The inspector refuses your ${a.amount} coins (${Math.round(a.chance * 100)}% chance) and calls the guards (D-136).`, "bad"); return fight(state);
  }
  if (opts.phase === "discovery" && action.type === "surrender") return surrender(state);
  if (opts.phase === "overflow" && action.type === "discard" && state.caravan.cargo[action.i]) return discard(state, action.i);
  if (opts.phase === "overflow" && action.type === "sell-excess") {
    const a = opts.actions.find((x) => x.type === "sell-excess" && x.i === action.i); if (!a) throw new Error("no market here");
    state.caravan.coins += a.price; note(state, `Sold ${cardName(a.card)} for ${a.price} coin${a.price === 1 ? "" : "s"} to make room.`);
    return discard(state, action.i, true);
  }
  if (opts.phase === "location" && action.type === "leave") { state.phase = "declare"; return; }
  if (opts.phase === "location" && ["buy", "sell", "restock"].includes(action.type)) return market(state, opts, action);
  if (opts.phase === "location" && action.type === "upgrade") return upgrade(state, opts, action);
  if (opts.phase === "location" && ["fence-bin", "fence-buy", "fence-sell", "fence-smuggle"].includes(action.type)) return fence(state, opts, action);
  if (opts.phase === "location" && action.type === "royal-castle" && opts.actions.some((x) => x.type === "royal-castle")) {
    state.final = true; note(state, "You ride up to the Royal Castle. The final inspection, the harshest of the run (D-432): failure ends the run.", "warn");
    state.sabotageRolled = false; state.sabotage = false; sabotage(state);   // any checkpoint, the final one included (D-657)
    state.cpTrader = null; state.phase = "checkpoint"; return;
  }
  if (opts.phase === "location" && ["invest", "withdraw", "close-investment", "collect-dividends"].includes(action.type)) return bank(state, opts, action);
  if (opts.phase === "location" && action.type === "tavern-buy") {
    const a = opts.actions.find((x) => x.type === "tavern-buy" && x.i === action.i); if (!a || !a.allowed) throw new Error("not available");
    state.caravan.coins -= a.price; state.caravan.cargo.push(state.taverns[state.caravan.at].food.splice(a.i, 1)[0]); note(state, `Tavern: ${cardName(a.card)} for ${a.price} coins.`); return;
  }
  if (opts.phase === "location" && ["hire", "merc-upgrade", "merc-sell"].includes(action.type)) {
    const a = opts.actions.find((x) => x.type === action.type && x.merc === action.merc); if (!a || a.allowed === false) throw new Error("not available");
    const c = state.caravan;
    if (a.type === "hire") { c.coins -= a.price; c.personal.push(mercCard(a.merc)); note(state, `Tavern: ${a.card.name} (${MERCS.find((y) => y.id === a.merc).title}) joins your personal deck for ${a.price} coins (D-337).`, "good"); }
    if (a.type === "merc-upgrade") { c.coins -= a.price; const k = c.personal.indexOf(a.card); c.personal[k] = mercCard(a.merc, a.card.stage + 1); note(state, `Tavern: ${a.card.name} becomes ${a.next} for ${a.price} coins; its deck changes with it (D-361).`, "good"); }
    if (a.type === "merc-sell") { c.coins += a.price; c.personal.splice(c.personal.indexOf(a.card), 1); if (c.partner === a.merc) c.partner = null; note(state, `Tavern: ${a.card.name} sold for ${a.price} coins (D-337).`); }
    c.capacity = capacity(c); return;
  }
  if (opts.phase === "location" && action.type === "attrition") {
    const a = opts.actions.find((x) => x.type === "attrition" && x.deck === action.deck && x.i === action.i);
    if (!a || !a.allowed) throw new Error("not available");
    const c = state.caravan, card = c[a.deck][a.i]; c.coins -= a.price; card.attrition = true;
    note(state, `Church: ${cardName(card)} is blessed with Attrition for ${a.price} coins.`, "good"); return;
  }
  if (opts.phase === "declare" && action.type === "trail") {
    const t = opts.trails.find((x) => x.to.id === action.to); if (!t) throw new Error("no such trail");
    const c = state.caravan; state.trailUsed = state.stops[c.at].stop; c.at = t.to.id; c.onHighway = false; state.visited.add(c.at);
    if (t.to.kind === "poi") state.discovered.add(c.at);
    note(state, `Game Trails: the woodland paths take you across to ${describe(t.to)} (stop ${t.to.stop}, no progress).`, "move"); return;
  }
  if (opts.phase === "checkpoint" && action.type === "submit") return submit(state);
  if (opts.phase === "checkpoint" && action.type === "bribery") {
    const a = opts.actions.find((x) => x.type === "bribery" && x.i === action.i && (x.deck || "cargo") === (action.deck || "cargo")); if (!a || !a.allowed) throw new Error("not available");
    const b = (state.cpBribery ||= { used: [], pct: 0 }); b.used.push(a.card); b.pct += a.pct; state.caravan.coins -= a.price;
    note(state, `Bribery: ${cardName(a.card)} buys ${Math.round(a.pct * 100)}% concealment for ${a.price} coins (now ${Math.round(b.pct * 100)}%).`, "good"); return;
  }
  if (opts.phase === "checkpoint" && action.type === "req-bribe") {
    const a = opts.actions.find((x) => x.type === "req-bribe"); if (!a || !a.allowed) throw new Error("not available");
    state.caravan.coins -= a.price; state.reqBribed = (state.reqBribed || 0) + a.missing;
    note(state, `Requirement bribe: ${a.price} coins cover the ${a.missing} missing card${a.missing === 1 ? "" : "s"} (D-108).`, "good"); return;
  }
  if (opts.phase === "checkpoint" && (action.type === "cp-buy" || action.type === "cp-sell")) {
    const a = opts.actions.find((x) => x.type === action.type && x.i === action.i);
    if (!a || a.allowed === false) throw new Error("not available");
    const c = state.caravan;
    if (a.type === "cp-buy") { c.coins -= a.price; c.cargo.push(state.cpTrader.splice(a.i, 1)[0]); note(state, `Bought ${cardName(a.card)} from the Checkpoint Trader for ${a.price} coins.`); }
    else { removeCargo(c, c.cargo[a.i]); c.coins += a.price; note(state, `Sold ${cardName(a.card)}${a.bundle > 1 ? ` and its bundle (${a.bundle} cards)` : ""} to the Checkpoint Trader for ${a.price} coins.`); lostRun(state); }
    return;
  }
  if (opts.phase === "checkpoint" && action.type === "emergency" && opts.actions.some((a) => a.type === "emergency" && a.allowed)) return emergency(state);
  throw new Error(`illegal action ${action.type} in phase ${opts.phase}`);
}

function move(state, opts, action) {
  const m = opts.moves.find((x) => x.leg === action.leg);
  if (!m || !m.available) throw new Error("illegal move");
  const c = state.caravan; c.lastMatch = null;            // D-711: a Zsír result orders the next movement only
  const pay = action.payments || defaultPayment(state, m.fees);
  // pay each fee in coins or with one random cargo card, weighted towards száraz cargo (D-860 (1), D-861)
  m.fees.forEach((f, i) => {
    if (f.robbery) { c.coins += f.robbery; note(state, `Highway Robbery: you collect ${f.robbery} coins from the toll-booth instead of paying.`, "good"); }
    else if (f.waived) note(state, `No fee: ${f.label.replace(/^.*\((?:waived: )?(.*)\)$/, "$1")}.`, "good");
    else if (pay[i] === "coins" && c.coins >= f.amount) { c.coins -= f.amount; note(state, `Paid ${f.amount} coins: ${f.label}.`); }
    else if (c.cargo.length) {
      const card = takeRandomCargo(state);
      note(state, `Paid the ${f.label} with a random cargo card: ${card.rank} of ${card.suit}.`, "warn");
    }
  });
  c.onHighway = m.leg.segments[m.leg.segments.length - 1].cls === "highway";
  c.at = m.leg.to; state.visited.add(c.at);
  const to = state.stops[c.at];
  note(state, `Moved to ${describe(to)} (stop ${to.stop}).`, "move");
  if (lostRun(state)) return;
  roadAbilities(state, m.leg);
  arrive(state);
}

function market(state, opts, action) {
  const c = state.caravan, m = opts.market;
  const a = opts.actions.find((x) => x.type === action.type && (x.i === action.i || action.type === "restock"));
  if (!m || !a) throw new Error("illegal market action");
  if (action.type === "buy") {
    if (!a.allowed) throw new Error(c.cargo.length >= c.capacity ? "wagon full" : "not enough coins");
    c.coins -= a.price; c.cargo.push(m.stock.splice(action.i, 1)[0]);
    note(state, `Bought ${a.card.rank} of ${a.card.suit} for ${a.price} coins.`);
  } else if (action.type === "sell") {
    c.coins += a.price + bundling(state, a.card, a.price) + falseAdvertising(state, m, a.card, a.price); removeCargo(c, c.cargo[action.i]);
    note(state, `Sold ${cardName(a.card)}${a.bundle > 1 ? ` and its bundle (${a.bundle} cards)` : ""} for ${a.price} coins.`);
    lostRun(state);
  } else {
    if (!a.allowed) throw new Error("not enough coins");
    c.coins -= a.price; m.stock = []; while (m.stock.length < m.size) m.stock.push(commodity(state.rng, m));
    note(state, `Paid ${a.price} coins to restock the market (provisional fee, D-859 (4)).`);
  }
}

function takeRandomCargo(state) {
  const w = PLACEHOLDER.cardPaymentWeight;
  const card = state.rng.weighted(state.caravan.cargo, (x) => (SZARAZ.has(x.rank) ? w.szaraz : w.rich));
  state.caravan.cargo.splice(state.caravan.cargo.indexOf(card), 1);
  return card;
}

// Overworld Abilities of the personal deck, at the end of a journey (makk.md; D-859 (3))
function roadAbilities(state, leg) {
  const c = state.caravan, r = state.rng;
  villageAbilities(state, state.stops[leg.to]);
  const offHighway = leg.segments.some((g) => g.cls !== "highway");
  // the Deserter (mercenary #3, every stage): 50 % per move for an unrefined Farmfolk VIII Wheat in cargo, space permitting (D-346, D-373)
  for (const _ of c.personal.filter(MERC.deserter)) if (r.next() < luck(state, 0.5)) { if (slots(c) < c.capacity) { c.cargo.push({ rank: "VIII", suit: "Farmfolk", name: "Wheat", roster: "main" }); growl(state, "The Deserter turns up a sack of Wheat (supply acquisition)."); } }
  const hillVIII = () => E.cardFromStage(r.pick(E.stagesOf((x) => x.suit === "Hillfolk" && x.rank === "VIII" && x.stage === 0)));
  const hillGain = (what) => { const g = hillVIII(); if (slots(c) < c.capacity) { c.cargo.push(g); growl(state, `${what}: ${cardName(g)}.`); } else growl(state, `${what}: the wagon is full (D-736).`); };
  // Scrounging (Keen Miner line in cargo): each other Hillfolk card in cargo adds 5 % for a Hillfolk VIII on the road; two at most (D-357, D-352)
  for (const x of two(c.cargo.filter(HILL.keen))) { const p = 0.05 * c.cargo.filter((y) => y !== x && y.suit === "Hillfolk").length; if (p > 0 && r.next() < luck(state, p)) hillGain("Scrounging"); }
  // Resource Acquisition (Smith's Papers, personal deck; two at most): stopping where Hillfolk live, 50 % each for a Hillfolk VIII
  const dest = state.stops[leg.to];
  if (dest && (dest.suits || []).includes("Hillfolk")) for (const _ of two(c.personal.filter(HILL.smiths))) if (r.next() < luck(state, 0.5)) hillGain("Resource Acquisition");
  // Foraging and Hunting (Forester's Papers, personal deck): an off-highway move, whatever its destination, brings 1-3 ordinary VIII
  // (quantity provisional; suit unstated: any, D-353), space permitting (D-504, D-736)
  if (offHighway && c.personal.some(FOREST.papers)) {
    const n = 1 + Math.floor(r.next() * 3);
    for (let k = 0; k < n; k++) { const v = r.pick(E.stagesOf((x) => x.rank === "VIII" && x.stage === 0 && x.roster !== "secret alternative"));
      if (slots(c) < c.capacity) { c.cargo.push(E.cardFromStage(v)); growl(state, `Foraging and Hunting: ${v.name} from the wild.`); } else { growl(state, "Foraging and Hunting: the wagon is full (D-736)."); break; } }
  }
  // Gamekeeper (Steady Hunter line, personal deck): income at the end of each off-highway road (amount PLACEHOLDER; D-509); two at most
  if (offHighway) for (const _ of two(c.personal.filter(FOREST.steady))) { c.coins += PLACEHOLDER.gamekeeper; growl(state, `Gamekeeper: ${PLACEHOLDER.gamekeeper} coins from the estate's game.`); }
  // Roadkill (Black Truffles 50 %, Royal Truffles 100 %, cargo): each road, highways included, a basic Hides; two at most (D-651, D-352)
  for (const x of two(c.cargo.filter(FOREST.blackTruffles))) if (x.refined >= 2 || r.next() < luck(state, 0.5)) {
    if (slots(c) < c.capacity) { c.cargo.push({ rank: "VIII", suit: "Forestfolk", name: "Hides", roster: "main" }); growl(state, "Roadkill: Hides by the roadside."); } else growl(state, "Roadkill: the wagon is full (D-736).");
  }
  // Fishing (Patient Fisherman line, personal deck; two at most): stopping where Fisherfolk live, a Fisherfolk VIII with room, else one
  // random Fisherfolk VIII in cargo refines a stage (Salt Cure stops the refining, D-581)
  if (dest && (dest.suits || []).includes("Fisherfolk")) for (const _ of two(c.personal.filter(FISH.patient))) {
    if (slots(c) < c.capacity) { const g = E.cardFromStage(r.pick(E.stagesOf((x) => x.suit === "Fisherfolk" && x.rank === "VIII" && x.stage === 0))); c.cargo.push(g); growl(state, `Fishing: ${cardName(g)} from the water.`); }
    else if (!salted(state)) { const el = c.cargo.filter((y) => y.suit === "Fisherfolk" && y.rank === "VIII" && (y.refined || 0) < 2 && COMMODITY_NEXT(y)); if (el.length) { const t = r.pick(el), before = cardName(t); applyUpgrade(t, "refine"); afterRefine(state, t); growl(state, `Fishing: ${before} is cleaned into ${cardName(t)}.`); } }
  }
  // Crop Raiding (Chewed Leaf, personal deck): after an off-highway move, 50 % for a random unrefined Farmfolk, Plainsfolk or Forestfolk
  // VIII (its version at random, D-487) in cargo, space permitting; two at most (D-506, D-352)
  if (leg.segments.some((g) => g.cls !== "highway")) for (const _ of two(c.personal.filter(AGRI.leaf))) if (r.next() < luck(state, 0.5)) {
    const v = r.pick(E.stagesOf((x) => ["Farmfolk", "Plainsfolk", "Forestfolk"].includes(x.suit) && x.rank === "VIII" && x.stage === 0 && x.roster !== "secret alternative"));
    if (slots(c) < c.capacity) { c.cargo.push(E.cardFromStage(v)); growl(state, `Crop Raiding: ${v.name} lifted from a field.`); } else growl(state, "Crop Raiding: the wagon is full (D-736).");
  }
  // Fealty: 2 coins per complete group of 4 Farmfolk produce (VIII, X) carried
  const lords = Math.min(2, c.personal.filter(FARMFOLK.prosperous).length);   // D-352
  if (lords) { const n = Math.floor(c.cargo.filter(FARMFOLK.produce).length / 4) * 2 * lords; if (n) { c.coins += n; growl(state, `Fealty: your tenants pay ${n} coins.`); } }
  // Pilgrimage: each Fervent Clergy Alsó, 50 % per journey to gain an ordinary Clergy Alsó in cargo; space permitting (D-736)
  for (const x of c.personal.filter(CLERGY.fervent)) if (r.next() < luck(state, 0.5)) {
    if (slots(c) < c.capacity) { c.cargo.push({ rank: "Alsó", suit: "Clergy" }); growl(state, "Pilgrimage: a pilgrim joins your caravan (Clergy Alsó)."); }
    else growl(state, "Pilgrimage: a pilgrim would join you, but the wagon is full (D-736).");
  }
  // Beasts in cargo, each road, highways included, capacity applies (wild.md): Rooting (a Beasts VIII), Spore Spread (a
  // Mushrooms), King of the Forest (a random ordinary Beasts card: VII-Király weight 2, X and Ász 1); 50 % each
  const beastGain = (g, what) => { if (slots(c) < c.capacity) { c.cargo.push(g); growl(state, what); } else growl(state, `${what.split(":")[0]}: the wagon is full (D-736).`); };
  for (const _ of c.cargo.filter(BEASTS.rooting)) if (r.next() < luck(state, 0.5)) { const g = E.cardFromStage(r.pick(E.stagesOf((s) => s.suit === "Beasts" && s.rank === "VIII" && s.stage === 0))); beastGain(g, `Rooting: the boar turns up ${cardName(g)}.`); }
  for (const _ of c.cargo.filter(BEASTS.bountiful)) if (r.next() < luck(state, 0.5)) beastGain({ rank: "VIII", suit: "Beasts", name: "Mushrooms", roster: "main" }, "Spore Spread: fresh Mushrooms sprout in the wagon.");
  for (const _ of c.cargo.filter(BEASTS.mighty)) if (r.next() < luck(state, 0.5)) {
    const rank = r.weighted(["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"], (x) => (x === "X" || x === "Ász" ? 1 : 2));
    const v = E.isCommodity({ rank }) && E.stagesOf((s) => s.suit === "Beasts" && s.rank === rank && s.stage === 0 && s.roster === "main")[0];
    const g = v ? E.cardFromStage(v) : { rank, suit: "Beasts" }; beastGain(g, `King of the Forest: ${cardName(g)} follows the bear.`);
  }
  // Dowry (Surprising rural Chest line, cargo or personal deck; two at most): each journey 10 / 15 / 20 % for a random unrefined X
  // of any suit in cargo, space permitting (D-549)
  for (const x of two([...c.cargo, ...c.personal].filter(RURAL.surprising))) if (r.next() < luck(state, [0.1, 0.15, 0.2][x.refined || 0])) {
    const v = r.pick(E.stagesOf((s) => s.rank === "X" && s.stage === 0)); beastGain(E.cardFromStage(v), `Dowry: ${v.name} turns up in the chest.`);
  }
  // Snuffling (Savoury Plains Pig at its base stage, personal deck; two at most): each journey, independently, 50 % a basic
  // Mushrooms and 2 % a basic Truffles, space permitting (D-594, D-595)
  for (const _ of two(c.personal.filter((x) => ALT.pig(x) && x.adjective === "Savoury" && !x.refined))) {
    if (r.next() < luck(state, 0.5)) beastGain({ rank: "VIII", suit: "Beasts", name: "Mushrooms", roster: "main" }, "Snuffling: the pig turns up Mushrooms.");
    if (r.next() < luck(state, 0.02)) beastGain({ rank: "X", suit: "Forestfolk", name: "Truffles", roster: "main" }, "Snuffling: the pig finds Truffles!");
  }
  // Natural Maturation (Ripening Grapes in cargo): once per card per journey, one step at most (D-561, D-562)
  for (const x of salted(state) ? [] : c.cargo.filter((y) => ALT.grapes(y) && y.adjective === "Ripening")) {
    const rr = x.refined || 0;
    if (rr < 2 && r.next() < luck(state, 0.5) + temper(state)) { const before = cardName(x); applyUpgrade(x, "refine"); afterRefine(state, x); growl(state, `Natural Maturation: ${before} matures into ${cardName(x)}.`); }
    else if (rr === 2 && r.next() < luck(state, 0.1)) { const i = c.cargo.indexOf(x); c.cargo.splice(i, 1, { rank: "X", suit: "Townsfolk", name: "Bottled Wine", roster: "main" }); growl(state, "Natural Maturation: the Barrelled Wine is bottled (Townsfolk Bottled Wine)."); }
  }
  // Noble Rot (Decadent Noble Rot Harvest in cargo): each journey, 5 % for another Decadent Noble Rot Harvest and 50 % to rot
  // one other Sweet Grapes into Noble Rot Harvest; new ones don't act this journey (D-563, D-564)
  for (const x of c.cargo.filter((y) => decadent(y) && y.refined === 1)) {
    if (r.next() < 0.05 && slots(c) < c.capacity) { c.cargo.push({ rank: "X", suit: "Farmfolk", roster: "alternative", refined: 1, adjective: "Decadent", line: "Sweet Grapes", name: "Decadent Noble Rot Harvest" }); growl(state, "Noble Rot: the rot spreads to a new crate."); }
    const sw = c.cargo.filter((y) => ALT.sweet(y) && !y.refined && y !== x);
    if (sw.length && !salted(state) && r.next() < 0.5 + temper(state)) { const t = r.pick(sw); const before = cardName(t); applyUpgrade(t, "refine"); growl(state, `Noble Rot: ${before} turns into ${cardName(t)}.`); }
  }
  // Hallowed (Consecrated / Saint's Reliquary, cargo or personal deck): 50 % for a basic Pilgrim; Saint's also 2 % for a Drifter;
  // each needs its own slot; two copies at most (D-574, D-575, D-352)
  for (const x of two([...c.cargo, ...c.personal].filter((y) => ALT.reliquary(y) && y.adjective === "Hallowed" && (y.refined || 0) >= 1))) {
    if (r.next() < luck(state, 0.5)) { if (slots(c) < c.capacity) { c.cargo.push({ rank: "Alsó", suit: "Clergy", name: "Pilgrim" }); growl(state, "Hallowed: a pilgrim joins the relic's train."); } }
    if (x.refined >= 2 && r.next() < luck(state, 0.02)) { if (slots(c) < c.capacity) { c.cargo.push({ rank: "Ász", suit: "Clergy", roster: "alternative", name: "Drifter" }); growl(state, "Hallowed: a Drifter follows the relic."); } }
  }
  // Basic Training (Seasoned King's Men VII in cargo): after each road, 50 % to turn one Conscript in cargo into an Infantryman
  for (const _ of two(c.cargo.filter(KINGS.seasoned))) if (c.cargo.some(conscript) && r.next() < luck(state, 0.5)) {   // D-352: two copies at most
    const k = c.cargo.findIndex(conscript); c.cargo.splice(k, 1, { rank: "VII", suit: "King's Men" }); growl(state, "Basic Training: a Conscript is drilled into a King's Men Infantryman.");
  }
  // Roadside Refinement (Shrewd Bandits Felső): each refines one Bandits VIII in cargo per road, free (least refined first)
  for (const _ of salted(state) ? [] : c.personal.filter(BANDITS.shrewd)) {
    const el = c.cargo.filter((x) => x.suit === "Bandits" && x.rank === "VIII" && (x.refined || 0) < 2);   // "one Bandits VIII" (thug.md)
    if (!el.length) break;
    const t = r.pick(el);                                       // unspecified selection is random (ABL-20)
    const before = cardName(t); applyUpgrade(t, "refine"); growl(state, `Roadside Refinement: the Fence turns ${before} into ${cardName(t)}.`); afterRefine(state, t);
  }
  // Extortion (Crooked Bandit Chief): 1 coin per Bandits face card in cargo, each Chief, at the end of each road
  for (const _ of c.personal.filter(BANDITS.crooked)) { const n = c.cargo.filter((x) => x.suit === "Bandits" && ["Alsó", "Felső", "Király", "Ász"].includes(x.rank)).length;   // D-304
    if (n) { c.coins += n; growl(state, `Extortion: ${n} coin${n === 1 ? "" : "s"} squeezed from the road.`); } }
  // Herd Growth (Dusty Plainsfolk Alsó): one 50 % roll per journey for a basic Plainsfolk VIII; doesn't stack
  const gain = (card, what) => { if (slots(c) < c.capacity) { c.cargo.push(card); growl(state, what); } else growl(state, `${what.split(":")[0]}: the wagon is full (D-736).`); };
  if (c.personal.some(PLAINS.dusty) && r.next() < luck(state, 0.5)) {
    const card = E.cardFromStage(r.pick(E.stagesOf((s) => s.suit === "Plainsfolk" && s.rank === "VIII" && s.stage === 0)));
    gain(card, `Herd Growth: ${cardName(card)} joins the herd.`);
  }
  // Shearing (Shaggy Racka Sheep): each one, 50 % per journey for one Wool
  for (const _ of c.personal.filter(PLAINS.shaggy)) if (r.next() < luck(state, 0.5)) gain({ rank: "VIII", suit: "Plainsfolk", refined: 1, name: "Wool" }, "Shearing: a bale of Wool.");
  // Field Research: on a non-highway road, one upgraded Farmfolk VIII (rarely a Farmfolk X); space permitting (D-736)
  if (c.personal.some(FARMFOLK.wise) && leg.segments.some((g) => g.cls !== "highway")) {
    const x = r.next() < luck(state, PLACEHOLDER.fieldResearchXChance);
    const pool = E.stagesOf((s) => s.suit === "Farmfolk" && s.rank === (x ? "X" : "VIII") && (x || s.stage >= 1));
    const card = E.cardFromStage(r.pick(pool));
    if (slots(c) < c.capacity) { c.cargo.push(card); growl(state, `Field Research: you find ${cardName(card)} along the way.`); }
    else growl(state, `Field Research found ${cardName(card)}, but the wagon is full (D-736).`);
  }
}
// the rural Townsfolk roster on the road (townsfolk-rural.md): Grist (Stitched Millstone / Millstone Pair in cargo, arriving at a
// settlement) before Milling (Gruelling Felső, personal deck), as the X resolves before the Felső (D-402); then Gathering Hike
// (Tireless Alsó, personal deck). Beneficial rolls: Good Fortune, Lard and Crooked apply; space permitting (D-736)
function villageAbilities(state, to) {
  const c = state.caravan, r = state.rng, room = () => slots(c) < c.capacity;
  const grist = (x) => x.rank === "VIII" && !x.refined && ["Plainsfolk", "Farmfolk", "Townsfolk", "Beasts"].includes(x.suit) && COMMODITY_NEXT(x) && x.roster !== "secret alternative";
  if (to && to.kind === "settlement" && !salted(state)) for (const mill of two(c.cargo.filter(RURAL_T.stitched))) {
    const el = c.cargo.filter(grist), pick = mill.refined >= 2 ? el : el.length ? [r.pick(el)] : [];   // Stitched: one at random; Pair: every one
    for (const x of pick) if (r.next() < luck(state, 0.5) + temper(state)) { const before = cardName(x); applyUpgrade(x, "refine"); afterRefine(state, x); growl(state, `Grist: the millstone grinds ${before} into ${cardName(x)}.`); }
  }
  // Milling (D-609 to D-611): Mill Hand mills a Farmfolk Flour, Miller a Farmfolk Wheat, into a basic Bolted Flour; random; upgrades lost
  for (const x of salted(state) ? [] : two(c.personal.filter(RURAL_T.gruelling))) {
    const stage = x.refined >= 1 ? 0 : 1, el = c.cargo.filter((y) => y.suit === "Farmfolk" && y.rank === "VIII" && (!y.roster || y.roster === "main") && (y.refined || 0) === stage);
    if (el.length && r.next() < luck(state, 0.5)) { const t = r.pick(el); c.cargo.splice(c.cargo.indexOf(t), 1, { rank: "VIII", suit: "Townsfolk", roster: "rural roster", name: "Bolted Flour" }); growl(state, `Milling: the ${cardName(t)} is milled into Bolted Flour.`); }
  }
  // Gathering Hike (D-608): independent checks in order, Mushrooms, then (Herbalist) Medicinal Herbs and Chamomile; what doesn't fit is lost
  for (const x of two(c.personal.filter(RURAL_T.tireless))) {
    const finds = [[0.5, { rank: "VIII", suit: "Beasts", name: "Mushrooms", roster: "main" }]];
    if (x.refined >= 1) finds.push([0.5, { rank: "VIII", suit: "Clergy", name: "Medicinal Herbs", roster: "main" }], [0.01, { rank: "X", suit: "Beasts", name: "Chamomile", roster: "agricultural roster" }]);
    for (const [p, g] of finds) if (r.next() < luck(state, p)) { if (room()) { c.cargo.push({ ...g }); growl(state, `Gathering Hike: ${g.name} gathered along the way.`); } else growl(state, "Gathering Hike: the wagon is full (D-736)."); }
  }
}
// at a settlement: Stud Service (villages; at most 2 bulls) and Travelling Spectacle (every settlement; at most 2 sheep)
// Trading Up (Chapman's Papers, rural Tradesfolk IX refined, personal deck; tok-rural.md, D-546, D-547; buildable since D-942):
// on each settlement visit, 50 % (a beneficial roll, D-378) that one cargo commodity is replaced by a more valuable one of the same
// rank, the same refinement stage and the same upgrade level (with an adjective if it had one), from one of the settlement's suits;
// cargo count unchanged. Which commodity and which replacement: random among those that qualify (ABL-20); copies stack twice (D-352)
function tradingUp(state, here) {
  const c = state.caravan, copies = Math.min(2, c.personal.filter(RURAL.chapman).length), suits = here.suits || [];
  for (let k = 0; k < copies; k++) {
    if (state.rng.next() >= luck(state, 0.5)) continue;
    // "more valuable" counts upgrade potential too (your ruling, D-944): current value plus the value of the upgrades the card can
    // still take (remaining refinement steps; its adjective if it has none), so base goods compare by what they can become
    const worth = (x) => { const e = upgradeEntry(x); let p = 0;
      if (e) { for (let k = x.refined || 0; k < e.refine.prices.length; k++) p += e.refine.prices[k];
        if (!x.adjective && e.adj) { const ap = e.adj.price; p += Array.isArray(ap) ? ap[Math.min(x.refined || 0, ap.length - 1)] : ap; } }
      return cardValue(x) + p; };
    const better = (x) => {
      const v = worth(x), stage = x.refined || 0;
      return E.stagesOf((st) => st.rank === x.rank && st.stage === stage && suits.includes(st.suit) && st.roster !== "secret alternative").map((st) => {
        const y = E.cardFromStage(st);
        if (x.adjective) { const e = upgradeEntry(y); if (!e || !e.adj) return null; y.adjective = e.adjective; if (e.alt) y.line = e.stages[0]; y.name = upgradedName(y); }
        return worth(y) > v ? y : null;
      }).filter(Boolean);
    };
    const cands = c.cargo.filter((x) => E.isCommodity(x)).map((x) => ({ x, ups: better(x) })).filter((o) => o.ups.length);
    if (!cands.length) { growl(state, "Trading Up: nothing here is worth more than what you carry."); continue; }
    const o = state.rng.pick(cands), y = state.rng.pick(o.ups);
    c.cargo.splice(c.cargo.indexOf(o.x), 1, y);
    note(state, `Trading Up: your ${cardName(o.x)} goes for ${cardName(y)}, a better prospect (value with its upgrades: ${worth(o.x)} → ${worth(y)}).`, "good");
  }
}
function settlementAbilities(state, here) {
  const c = state.caravan, farmPlains = (here.suits || []).filter((s) => s === "Farmfolk" || s === "Plainsfolk");
  tradingUp(state, here);
  // Goodwill counts every visit to a settlement with Farmfolk or Plainsfolk this map (D-370), once per visit
  if (farmPlains.length && c.personal.some(PLAINS.papers)) state.goodwillVisits = (state.goodwillVisits || 0) + 1;   // IX passives work only in the personal deck (D-046, D-260)
  // Hospitality (Csikós's Papers in the personal deck): at 10 or fewer cargo cards, refilled to 12 with unrefined Farmfolk
  // or Plainsfolk VIII (a random mix where both live)
  if (farmPlains.length && c.personal.some(PLAINS.papers) && c.cargo.length <= 10) {
    const add = 12 - c.cargo.length;
    for (let k = 0; k < add; k++) c.cargo.push(E.cardFromStage(state.rng.pick(E.stagesOf((s) => s.suit === state.rng.pick(farmPlains) && s.rank === "VIII" && s.stage === 0 && s.roster === "main"))));
    growl(state, `Hospitality: the locals fill your wagon with ${add} sacks and fleeces.`);
  }
  // What a Catch! (Voracious Sterlet line, personal deck; two at most): each settlement visit, 50 % for a basic Fisherman in cargo
  for (const _ of two(c.personal.filter(FISH.voracious))) if (state.rng.next() < luck(state, 0.5)) {
    if (slots(c) < c.capacity) { c.cargo.push({ rank: "Felső", suit: "Fisherfolk" }); growl(state, "What a Catch!: a fisherman signs on (Fisherfolk Felső)."); } else growl(state, "What a Catch!: the wagon is full (D-736).");
  }
  // Local Levy (Affluent Magistrate line, personal deck): 10 coins at a settlement where Hillfolk live; two at most (D-260)
  if ((here.suits || []).includes("Hillfolk")) for (const _ of two(c.personal.filter(HILL.affluent))) { c.coins += 10; growl(state, "Local Levy: the Hillfolk pay 10 coins in dues."); }
  if ((here.services || []).includes("Tavern")) tavernRumour(state, here);
  // Poultry Theft (Csalavér, personal deck): each settlement visit, 50 % for a Feathers in cargo, space permitting; two at most (D-490, D-352)
  for (const _ of two(c.personal.filter(AGRI.csalaver))) if (state.rng.next() < luck(state, 0.5)) {
    if (slots(c) < c.capacity) { c.cargo.push({ rank: "VIII", suit: "Beasts", roster: "agricultural roster", name: "Feathers" }); growl(state, "Poultry Theft: the fox brings home Feathers."); }
    else growl(state, "Poultry Theft: the wagon is full (D-736).");
  }
  // Tax Collection (Village Judge, personal deck): arriving at a village 2 coins, a market town 4; nothing in towns (D-615, D-623)
  for (const _ of two(c.personal.filter(RURAL_T.judge))) { const n = { village: 2, "market town": 4 }[here.tier] || 0; if (n) { c.coins += n; growl(state, `Tax Collection: the Village Judge collects ${n} coins in dues.`); } }
  if (here.tier === "village") {
    const bulls = c.personal.filter(FARMFOLK.stud).slice(0, 2);
    const n = bulls.reduce((a, b) => a + PLACEHOLDER.studServiceCoins * (b.refined >= 2 ? 2 : 1), 0);
    if (n) { c.coins += n; growl(state, `Stud Service: ${n} coins from the village's farmers.`); }
  }
  // Patronage (Esteemed Clergy Felső): at a town, income by the Clergy face cards in cargo; Sacred Teachings (Revered X) adds
  if (isTownOrCity(here) && c.personal.some(CLERGY.esteemed)) {
    const faces = c.cargo.filter(CLERGY.face).length;
    const bonus = c.personal.filter(CLERGY.revered).reduce((a, x) => a + PLACEHOLDER.sacredTeachingsBonus * (1 + (x.refined || 0)), 0);
    const n = faces ? faces * PLACEHOLDER.patronageCoinsPerFace + bonus : 0;
    if (n) { c.coins += n; growl(state, `Patronage: the faithful of ${here.name} give ${n} coins.`); }
  }
  // Kickbacks (Greedy Townsfolk VII in cargo): each one, on entering a settlement, a bribe: coins or one rank VIII cargo card
  // (odds, amounts and pool PLACEHOLDER: urban.md leaves them TBD)
  const K = PLACEHOLDER.kickbacks;
  for (const _ of c.cargo.filter(TOWNS.greedy)) {
    if (state.rng.next() < K.coinChance) { const n = K.coins[here.tier] ?? K.coins.town; c.coins += n; growl(state, `Kickbacks: the watchman pockets ${n} coin${n === 1 ? "" : "s"} for you.`); }
    else { const pool = E.stagesOf((s) => s.rank === "VIII" && s.stage === 0);   // D-353: every commodity type, any region
      const g = pool.length ? E.cardFromStage(state.rng.pick(pool)) : { rank: "VIII", suit: state.rng.pick(here.suits || SUITS) };
      if (slots(c) < c.capacity) { c.cargo.push(g); growl(state, `Kickbacks: a "gift" of ${cardName(g)}.`); } else growl(state, "Kickbacks: a gift, but the wagon is full (D-736)."); }
  }
  const town = isTownOrCity(here);
  // Black Market (Intoxicating Bandits X in cargo): income on arriving at a town or city, by stage (amounts PLACEHOLDER)
  if (town) { const n = c.cargo.filter(BANDITS.intoxicating).reduce((a, x) => a + PLACEHOLDER.blackMarket[x.refined || 0], 0);
    if (n) { c.coins += n; growl(state, `Black Market: ${n} coins from under the counter.`); } }
  // Taxation (Pompous Burgomaster in cargo): entering a town or city, 1 coin per face card in cargo
  if (town) for (const _ of two(c.cargo.filter(TOWNS.pompous))) { const n = c.cargo.filter((x) => ["Alsó", "Felső", "Király"].includes(x.rank)).length; if (n) { c.coins += n; growl(state, `Taxation: ${n} coins in town dues.`); } }
  // Local Craftsmen (Citizenship Papers, personal deck): in a town or city, one random eligible rank VIII in cargo refines one
  // stage, free; settlement abilities stack at most twice (D-260)
  if (town && !salted(state)) for (const _ of c.personal.filter(TOWNS.citizen).slice(0, 2)) {
    const el = c.cargo.filter((x) => x.rank === "VIII" && (x.refined || 0) < 2 && COMMODITY_NEXT(x));
    if (!el.length) break;
    const t = state.rng.pick(el), before = cardName(t), nx = COMMODITY_NEXT(t);
    t.refined = (t.refined || 0) + 1; if (nx) t.name = nx; delete t.tags; afterRefine(state, t);
    growl(state, `Local Craftsmen: ${before} is refined into ${cardName(t)}.`);
  }
  // Carnivalfolk, where no Carnivalfolk live (carnival.md)
  if (!(here.suits || []).includes("Carnivalfolk")) {
    const busk = Math.min(2, c.personal.filter(CARNIVAL.charming).length) * 2;   // D-352, D-533                                    // Street Performance
    if (busk) { c.coins += busk; growl(state, `Street Performance: ${busk} coins from the square.`); }
    const toys = c.cargo.filter(CARNIVAL.lively).reduce((a, x) => a + 1 + (x.refined || 0), 0);     // Crowd Favourite 1 / 2 / 3
    if (toys) { c.coins += toys; growl(state, `Crowd Favourite: the children pay ${toys} coin${toys === 1 ? "" : "s"} to see your toys.`); }
    const add = (card, what) => { if (slots(c) < c.capacity) { c.cargo.push(card); growl(state, what); } else growl(state, `${what.split(":")[0]}: the wagon is full (D-736).`); };
    for (const _ of two([...c.cargo, ...c.personal].filter(CARNIVAL.deft))) {                           // Payment in Kind
      const g = E.cardFromStage(state.rng.pick(E.stagesOf((s) => s.rank === "VIII" && s.stage === 0 && s.roster === "main")));
      add(g, `Payment in Kind: the audience pays in ${cardName(g)}.`);
    }
    for (const _ of two(c.personal.filter(CARNIVAL.resounding))) if (state.rng.next() < luck(state, 0.75)) {        // Roll Up! 75 %
      const suit = state.rng.pick(here.suits || SUITS), rank = state.rng.pick(["Alsó", "Felső", "Király", "VII"]), x = state.rng.next();
      const g = { rank, suit }; const e = upgradeEntry(g);
      if (x >= 0.9 && e && e.adjective) applyUpgrade(g, "adjective"); else if (x >= 0.7 && e) applyUpgrade(g, "refine"); else if (x >= 0.7) g.refined = 1;
      add(g, `Roll Up!: ${cardName(g)} joins the show.`);
    }
  }
  // Enchanting (Enchanting Koboz line, personal deck; two at most): on arriving at a settlement, 50 % for a basic face card of one
  // of its suits (Koboz Alsó; Lute Alsó or Felső; Harp up to Király), and at Harp an independent 1 % for an Ász; the primary
  // first (D-603, D-604)
  for (const x of two(c.personal.filter((y) => ALT.koboz(y) && y.adjective === "Enchanting"))) {
    const ranks = [["Alsó"], ["Alsó", "Felső"], ["Alsó", "Felső", "Király"]][x.refined || 0], suits = here.suits || SUITS;
    const recruit = (g, what) => { if (slots(c) < c.capacity) { c.cargo.push(g); growl(state, what); } };
    if (state.rng.next() < luck(state, 0.5)) { const g = { rank: state.rng.pick(ranks), suit: state.rng.pick(suits) }; recruit(g, `Enchanting: the music draws in ${cardName(g)}.`); }
    if (x.refined >= 2 && state.rng.next() < luck(state, 0.01)) { const g = { rank: "Ász", suit: state.rng.pick(suits) }; recruit(g, `Enchanting: the harp draws in ${cardName(g)}!`); }
  }
  // Odd Jobs (Hardworking rural Porter, personal deck; two at most): each settlement visit, 50 % for 1 coin (Apprentice 2) (D-532, D-533)
  for (const x of two(c.personal.filter(RURAL.hardworking))) if (state.rng.next() < luck(state, 0.5)) { const n = x.refined >= 1 ? 2 : 1; c.coins += n; growl(state, `Odd Jobs: ${n} coin${n === 1 ? "" : "s"} for a day's carrying.`); }
  const sheep = c.personal.filter(FARMFOLK.magnificent).slice(0, 2);
  const n = sheep.reduce((a, x) => a + ((x.refined || 0) >= 2 ? PLACEHOLDER.spectacleCoins.golden : PLACEHOLDER.spectacleCoins.base), 0);
  if (n) { c.coins += n; growl(state, `Travelling Spectacle: the crowd pays ${n} coins to see your sheep.`); }
  // Master Craftsmanship (Diligent Tradesfolk Felső in the personal deck): refines one Tradesfolk VIII in cargo, free; the
  // card is chosen at random (ABL-20); two copies at most (D-352)
  for (const _ of salted(state) ? [] : two(c.personal.filter(TRADES.diligent))) {
    const el = c.cargo.filter((x) => x.suit === "Tradesfolk" && x.rank === "VIII" && (!x.roster || x.roster === "main") && (x.refined || 0) < 2);
    if (!el.length) break;
    const t = state.rng.pick(el);
    const before = cardName(t); applyUpgrade(t, "refine"); afterRefine(state, t);
    growl(state, `Master Craftsmanship: your Master refines ${before} into ${cardName(t)}.`);
  }
}

// the cards that count toward the 8-card minimum: Locust Swarm cards never do, however they came (D-138, D-500, D-655)
export const counted = (c) => c.cargo.filter((x) => !AGRI.locust(x)).length;
const countedOut = (xs) => xs.filter((x) => !AGRI.locust(x)).length;
export const checkRun = (state) => lostRun(state);
// your partner for regular, checkpoint, ambush and duel encounters: the companion or one owned mercenary (D-156, D-199); deployed, its
// card is set aside and it plays from its own deck for its stage (D-157, D-448); POI matches don't use mercenaries (D-156)
// the Impresario keeps half of the income he makes for himself, rounded up for you (D-340, D-278); other mercenaries' gains are yours (D-349)
function mercShare(state, m) {
  if (!m.mercHalf || !m.sideGains) return;
  const n = Math.ceil(m.sideGains.coins / 2); state.caravan.coins += n; state.caravan.cargo.push(...m.sideGains.generated);
  if (n) note(state, `The Impresario hands over his half of what he made: ${n} coin${n === 1 ? "" : "s"} (D-340).`);
}
export function deployed(c) {
  const card = c.partner != null ? c.personal.find((x) => x.merc === c.partner) : null;
  if (!card) return { personal: c.personal, companion: null };
  const M = mercOf(card);
  return { personal: c.personal.filter((x) => x !== card), companion: { deck: mercDeck(card), name: `${card.name} (mercenary)`, card, half: M.id === 2 } };
}
// Hostile Takeover's test (tok.md, D-190): does the caravan owning this seat hold strictly more coins than every other caravan in
// the region? NPC seats belong to no caravan; without other caravans there's nothing to be richer than
export function wealthTest(state, owners) {
  const w = state.world; if (!w) return () => false;
  const all = [w.player, ...w.ais].filter((x) => !x.gone);
  return (seat) => { const o = owners[seat]; if (!o) return false; const others = all.filter((x) => x !== o); return others.length > 0 && others.every((x) => o.caravan.coins > x.caravan.coins); };
}
// an AI caravan's overflow (D-265) when cards reach it outside its own turn (a shared match, a duel, an ambush): it leaves its
// least valuable cards behind until the wagon fits
export function trimCargo(c) {
  c.capacity = capacity(c);
  while (slots(c) > c.capacity && c.cargo.length) { let lo = 0; c.cargo.forEach((x, i) => { if (cardValue(x) < cardValue(c.cargo[lo])) lo = i; }); c.cargo.splice(lo, 1); }
}
function lostRun(state) {
  if (counted(state.caravan) < RULES.cargoMinimum) {     // D-138: the run ends immediately
    state.ended = { won: false, outOfCards: true, reason: `Cargo fell to ${counted(state.caravan)} counted cards, below the minimum of ${RULES.cargoMinimum}${state.caravan.cargo.some(AGRI.locust) ? " (Locust Swarms don't count)" : ""}.` };
    note(state, state.ended.reason, "bad");
    return true;
  }
  return false;
}

// Arrival: abilities first (none yet, D-859 (3)), then the arrival event, then services (D-859 (1)).
function arrive(state) {
  const c = state.caravan, here = state.stops[c.at];
  if (here.kind === "checkpoint") {
    if (c.emergency) { c.emergency = null; note(state, "Back at the checkpoint within the deadline."); }
    sabotage(state);
    // Moving the Goalposts (Madcap Carnivalfolk Ász, personal deck): every arrival at the checkpoint, the return from an
    // emergency return included (your ruling, 2026-11-04), 50 % to redraw the requirement (one shared replacement, D-419)
    if (c.personal.some(CARNIVAL.madcap) && state.mode !== "playtest") {
      if (state.rng.next() < 0.5) { const old = state.requirement.title; let r, k = 0;
        do { r = drawScenario(state.reqCtx, null); } while (r.title === old && k++ < 20);
        state.requirement = r; note(state, `Moving the Goalposts: the guards' orders change from "${old}" to ${r.title}: ${r.ask}.`, "event"); }
      else note(state, "Moving the Goalposts: the orders stand (50%).");
    }
    if (!state.cpTrader) {
      const r = state.rng, n = PLACEHOLDER.checkpointTrader.stock;
      // not stocked from the requirement (D-121): random cards, commodities as named goods (D-487)
      state.cpTrader = Array.from({ length: n }, () => { const rank = r.pick(RANKS_), suit = r.pick(ALL_SUITS_);
        const v = E.isCommodity({ rank }) && E.stagesOf((s) => s.suit === suit && s.rank === rank && s.stage === 0);
        return v && v.length ? E.cardFromStage(r.pick(v)) : { rank, suit }; });
    }
    state.phase = "checkpoint"; endRound(state); return;
  }
  // back from an emergency return taken at the Royal Castle: through Castle Town and straight up to the castle again
  if (here.castleTown && c.emergency) { c.emergency = null; state.final = true; note(state, "Back through Castle Town and up to the Royal Castle within the deadline."); state.phase = "checkpoint"; endRound(state); return; }
  if (here.kind === "encounter") return roadEncounter(state, here);
  // Sticky Fleece: a bundle comes apart on arrival at the next settlement (D-742)
  if (here.kind === "settlement" && c.cargo.some((x) => x.bundle)) { for (const x of c.cargo) delete x.bundle; note(state, "The fleece bundle comes apart: its cards are separate again."); }
  if (here.kind === "settlement") {
    // Fairground Rights (Juggler's Papers, personal deck): passive settlement income on entering +30 %, summed, rounded up
    const c0 = c.coins; settlementAbilities(state, here);
    const income = c.coins - c0;
    if (income > 0 && c.personal.some(CARNIVAL.papers)) { const add = Math.ceil(income * 1.3) - income; c.coins += add; growl(state, `Fairground Rights: +${add} coin${add === 1 ? "" : "s"} on ${income} of income here.`); }
  }
  // Confiscation (Pandúr in the personal deck): entering a location associated with the Bandits: 49 % a Bandits VIII,
  // 1 % a Bandits X, 50 % nothing (cargo rules apply)
  if ((here.kind === "settlement" || here.kind === "poi") && c.personal.some(PLAINS.pandur) && ((here.suits || []).includes("Bandits") || here.poi === "bandit-overrun village")) {
    const x = state.rng.next(), rank = x < 0.01 ? "X" : x < luck(state, 0.5) ? "VIII" : null;
    if (!rank) growl(state, "Confiscation: the Pandúr finds nothing to seize.");
    else { const card = E.cardFromStage(E.stagesOf((s) => s.suit === "Bandits" && s.rank === rank && s.stage === 0 && s.roster === "main")[0]);
      if (slots(c) < c.capacity) { c.cargo.push(card); growl(state, `Confiscation: the Pandúr seizes ${cardName(card)}.`); } else growl(state, "Confiscation: something to seize, but the wagon is full (D-736)."); }
  }
  if (c.passenger && here.kind === "settlement") deliverPassenger(state, here);
  if (here.kind === "poi" && !state.discovered.has(here.id)) { state.discovered.add(here.id); note(state, `Discovered ${describe(here)}.`); }
  // D-425: arriving may reveal a Zsír match or none (procedural; frequency PLACEHOLDER); optional (D-426)
  if ((here.suits || []).length >= 4 && temp.locationOpportunity(state.rng)) {
    state.phase = "match-offer";
    note(state, `A Zsír match is on offer at ${here.name} (optional, D-426): the locals' four suits are ${here.suits.join(", ")}.`
      + (here.kind === "poi" && E.poiDeckNote(here) ? ` ${E.poiDeckNote(here)}` : ""));
    return;
  }
  // a visit without a match is a legitimate outcome (D-425), but it must be said, not left silent
  if (here.kind === "poi") {
    note(state, `No Zsír match at ${here.name} this visit (a match is never guaranteed, D-425). ${(here.services || []).length ? `The ${here.poi} has: ${here.services.join(", ")} (D-724).` : `A ${here.poi} offers no services (D-724, D-725).`}`
      + (E.poiDeckNote(here) ? ` When a match happens here: ${E.poiDeckNote(here)}` : "")
      , "event");
  } else if (here.kind === "settlement") {
    note(state, `No Zsír match at ${here.name} this visit (a match is never guaranteed, D-425). Its services are open.`, "event");
  }
  state.phase = "location"; endRound(state);
}

function locationMatch(state, accept) {
  if (!accept) { note(state, "Declined the match."); state.phase = "location"; endRound(state); return; }
  const here = state.stops[state.caravan.at];
  if (here.kind === "poi") return startNegotiation(state, here);   // POI partners are negotiated locally (D-150, D-872)
  startLocationMatch(state, here.suits.slice(0, 4), here.id, null, E.poiDeckCard(state.rng, null, null, here.tier, here.beasts_roster));   // D-487 versions; rosters by tier (D-530, D-554)
}

// ---------------------------------------------------------------- POI partner negotiation (D-150, D-263, D-282, D-298, D-872)
// Other caravans at the POI take part too (your ruling, 2026-11-05): each is a participant with its own four offers and pick;
// NPC locals fill the places that remain. You have priority: you choose your partner among all of them; the rest sit opposite,
// caravans before locals. Deals with a caravan partner settle as NPC deals do (D-872 (3)), the coins going to that caravan
function startNegotiation(state, here) {
  const r = state.rng, suits = here.suits.slice(0, 4);
  const pool = N.offerPool(r, suits, cardValue);
  const cars = (state.joiners ? state.joiners(state) : []).slice(0, 3).map((ai, k) => { const shown = [...pool].sort(() => ai.ai.rng.next() - 0.5).slice(0, 4);
    return { id: 10 + k, kind: "caravan", ai, name: ai.ai.name[0].toUpperCase() + ai.ai.name.slice(1), shown, pick: ai.ai.rng.pick(shown) }; });
  const npcs = [...cars, ...N.participants(r, suits, pool).slice(0, 3 - cars.length)];
  state.nego = { pool, npcs, shown: [...pool].sort(() => r.next() - 0.5).slice(0, 4), pick: null, suits };
  note(state, `Choosing a partner at ${here.name}: ${npcs.map((n) => n.kind === "caravan" ? n.name : `a ${n.suit} local`).join(", ")} take part. Pick one of your four offers; whoever picks the same deal partners you (D-263, D-298).`);
  state.phase = "negotiate";
}
function negotiationOptions(state) {
  const n = state.nego, c = state.caravan;
  if (n.pick === null) return { phase: "negotiate", stage: "pick", nego: n, seconds: PLACEHOLDER.negotiation.seconds,
    actions: [...n.shown.map((o) => ({ type: "offer", id: o.id, offer: o, allowed: o.id !== "money-up-front" || c.coins >= o.amount })), { type: "no-offer" }] };
  const matches = n.npcs.filter((x) => n.pick && x.pick.id === n.pick.id);
  const choices = matches.length ? matches : n.npcs;                    // no match: choose among the NPCs' picks (fallback)
  return { phase: "negotiate", stage: matches.length ? "matched" : "fallback", nego: n, matches,
    actions: [...choices.map((x) => ({ type: "partner", id: x.id, npc: x, deal: x.pick, allowed: x.pick.id !== "money-up-front" || c.coins >= x.pick.amount })),
              { type: "withdraw" }] };                       // the match stays optional (D-426): you may walk away
}
function negotiationAct(state, opts, action) {
  const n = state.nego;
  if (opts.stage === "pick") {
    if (action.type === "no-offer") { n.pick = false; note(state, "You make no offer."); }
    else { const a = opts.actions.find((x) => x.type === "offer" && x.id === action.id); if (!a || !a.allowed) throw new Error("not an offer you can make"); n.pick = a.offer; note(state, `Your offer: ${a.offer.text}`); }
    const o = negotiationOptions(state);
    if (o.stage === "matched" && o.matches.length === 1) return formPartnership(state, o.matches[0], "matched");
    if (o.stage === "fallback") note(state, "No local picked your deal. Choose a partner from what they asked for.", "warn");
    return;
  }
  if (action.type === "withdraw") { state.nego = null; note(state, "You walk away from the table: no match here this visit."); state.phase = "location"; endRound(state); return; }
  const a = opts.actions.find((x) => x.type === "partner" && x.id === action.id);
  if (!a || !a.allowed) throw new Error("not a partner you can take");
  formPartnership(state, a.npc, opts.stage);
}
function formPartnership(state, npc, how) {
  const n = state.nego, here = state.stops[state.caravan.at], c = state.caravan, deal = npc.pick;
  const rest = n.npcs.filter((x) => x !== npc).sort((a, b) => (b.kind === "caravan") - (a.kind === "caravan"));   // caravans sit first
  note(state, `${npc.name} partners you${how === "matched" ? " (you picked the same deal)" : ""}. Terms: ${deal.text}`, "good");
  if (deal.id === "money-up-front") { c.coins -= deal.amount; if (npc.kind === "caravan") npc.ai.caravan.coins += deal.amount; note(state, `Paid your partner ${deal.amount} coins up front.`); }
  state.nego = null;
  const deckCard = E.poiDeckCard(state.rng, here.poi, here.mine, null, here.beasts_roster);
  if (n.npcs.some((x) => x.kind === "caravan")) {               // a table with other caravans: the shared-seat match (D-914)
    const sv = (x) => (x.kind === "caravan" ? { kind: "caravan", ai: x.ai, deck: x.ai.caravan.personal, name: x.name } : { kind: "npc", suit: x.suit, name: x.name });
    const seats = [null, sv(rest[0]), sv(npc), sv(rest[1])];
    note(state, `At the table: ${seats[1].name} and ${seats[3].name} against you and ${seats[2].name}.`);
    return startLocationMatch(state, n.suits, here.id, null, deckCard, { seats, deal, partnerAi: npc.kind === "caravan" ? npc.ai : null });
  }
  startLocationMatch(state, n.suits, here.id, null, deckCard, { partner: npc.suit, opponents: rest.map((x) => x.suit), deal, partnerName: npc.name });
}
// after the match: card deals only if the named card was captured (D-263); profit sharing in coins (D-872); originals
// never divided (D-271): the player's captured cards leave only by the deal's own terms
function settleDeal(state, deal, got, partnerAi = null) {
  const c = state.caravan, r = state.rng, suits = state.stops[c.at].suits || SUITS, pc = partnerAi && partnerAi.caravan;
  const take = (x) => { const i = c.cargo.indexOf(x); if (i >= 0) c.cargo.splice(i, 1); const j = got.indexOf(x); if (j >= 0) got.splice(j, 1); };
  if (deal.id === "card") {
    const x = got.find((y) => y.rank === deal.card.rank && y.suit === deal.card.suit);
    if (x && pc) { const pay = Math.min(pc.coins, deal.price); take(x); pc.cargo.push(x); trimCargo(pc); pc.coins -= pay; c.coins += pay; note(state, `Deal: your partner buys ${cardName(x)} for ${pay} coins${pay < deal.price ? " (all it has)" : ""}.`, "good"); }
    else if (x) { take(x); c.coins += deal.price; note(state, `Deal: your partner buys ${cardName(x)} for ${deal.price} coins.`, "good"); }
    else note(state, `Deal: the ${deal.card.rank} of ${deal.card.suit} wasn't captured, so nothing changes hands.`);
  } else if (deal.id === "valuables-for-upgrades") {
    const v = c.cargo.filter((y) => y.rank === "X" || y.rank === "Ász").sort((a, b) => cardValue(a) - cardValue(b))[0];
    if (v) { take(v); if (pc) { pc.cargo.push(v); trimCargo(pc); } const g = N.upgradedGift(r, suits); c.cargo.push(g); note(state, `Deal: you give ${cardName(v)} and receive ${cardName(g)}.`, "good"); }
    else note(state, "Deal: you have no X or Ász to give, so nothing changes hands.");
  } else if (deal.id === "upgrades-for-valuables") {
    const u = c.cargo.filter((y) => y.refined || y.adjective).sort((a, b) => cardValue(a) - cardValue(b))[0];
    if (u) { take(u); if (pc) { pc.cargo.push(u); trimCargo(pc); } const g = N.valuableGift(r, suits); c.cargo.push(g); note(state, `Deal: you give ${cardName(u)} and receive ${cardName(g)}.`, "good"); }
    else note(state, "Deal: you have no upgraded card to give, so nothing changes hands.");
  } else if (deal.id === "profit-share") {
    const due = Math.min(c.coins, Math.ceil(deal.share * got.reduce((a, y) => a + cardValue(y), 0)));
    c.coins -= due; if (pc) pc.coins += due; note(state, `Deal: you pay your partner ${due} coins, their share of the captured value.`, due ? "warn" : "info");
  }
}

function startLocationMatch(state, suits, at, after, deckCard, team = {}) {
  // other caravans here join the match and take seats; NPC locals fill the rest (D-408, D-425): with one caravan it sits opposite
  // you, each of you partnered by a local; with two or three, partners are drawn at random (D-914)
  const joiners = !team.partner && !team.seats && state.joiners ? state.joiners(state) : [];
  let seats = team.seats || null;
  if (!seats && joiners.length) {
    const r = state.rng, local = () => { const su = r.pick(suits); return { kind: "npc", suit: su, name: `${su} local` }; };
    const cars = joiners.map((ai) => ({ kind: "caravan", ai, deck: ai.caravan.personal, name: ai.ai.name[0].toUpperCase() + ai.ai.name.slice(1) }));
    const others = [...cars, ...Array.from({ length: 3 - cars.length }, local)];
    if (cars.length === 1) seats = [null, cars[0], others[1], others[2]];
    else { const k = Math.floor(r.next() * others.length), partner = others.splice(k, 1)[0]; seats = [null, others[0], partner, others[1]]; }
    note(state, `Sharing the table: ${seats.slice(1).map((x) => x.name).join(", ")}${seats[2].kind === "caravan" ? ` (${seats[2].name} is your partner)` : ""} (D-914).`);
  }
  const dep = !team.partner && !seats && state.stops[at]?.kind !== "poi" ? deployed(state.caravan) : { personal: state.caravan.personal, companion: null };
  const m = zsirLocationMatch({ rng: state.rng, suits, playerPersonal: dep.personal, deckCard, partner: team.partner, opponents: team.opponents, wanted: state.requirement?.test, seats, companion: dep.companion,
                                names: team.partner ? ["You", `${team.opponents[0]} local`, team.partnerName, `${team.opponents[1]} local`] : undefined,
                                value: cardValue, trickLimit: PLACEHOLDER.trickLimit, onPlay: onPlay(state.rng), onTrick: onTrick(state.rng, state.caravan.personal, state.caravan.cargo) });
  m.richer = wealthTest(state, seats ? [state, ...seats.slice(1).map((x) => (x.kind === "caravan" ? x.ai : null))] : [state, null, team.partner ? null : state, null]);
  if (dep.companion) { m.mercHalf = dep.companion.half; m.mercSeat2 = true; }
  state.match = { m, at, kind: "location", after, deal: team.deal, partnerAi: team.partnerAi || null };
  state.phase = "match";
}

// the match is over: your team's captured encounter cards become your cargo (the companion owns nothing, D-216, D-232);
// plain Region 1 cards from a non-caravan pool keep their identity, no quality roll (D-801, D-824 (1)); personal cards are
// transient (they were copies of your deck and simply go back); unplayed cards leave the encounter (D-219)
function finishMatch(state) {
  const { m } = state.match, c = state.caravan;
  mercShare(state, m);
  // a shared match (D-914): you keep what your own seat captured; each caravan what its seat did; a local's captures stay here
  const mine = m.shared ? m.capturedBySeat[0] : m.captured[0];
  if (m.shared) m.shared.forEach((sv, k) => { if (!sv || sv.kind !== "caravan") return;
    const ac = sv.ai.caravan, won = m.capturedBySeat[k].map(plain), myTeam = k % 2 === 0;
    ac.cargo.push(...won, ...(k === 2 && m.sideGains ? m.sideGains.generated : [])); if (k === 2 && m.sideGains) ac.coins += m.sideGains.coins;
    trimCargo(ac);                                         // its overflow (D-265)
    ac.lastMatch = m.result === "draw" ? "draw" : (m.result === "win") === myTeam ? "win" : "lose"; });
  const got = mine.map((x) => qualityRoll(state, plain(x)));   // D-662: exact copy or base (encounter decks, not D-824 (1) pools)
  c.cargo.push(...got, ...m.generated); c.lastMatch = m.result;         // generated cards wait for this step (D-736)
  if (m.coins) { c.coins += m.coins; note(state, `Collection Plate earned you ${m.coins} coin${m.coins === 1 ? "" : "s"} in the match.`, "good"); }
  note(state, `Zsír at ${state.stops[state.match.at].name}: ${m.result === "win" ? "won" : m.result === "lose" ? "lost" : "drawn"} `
    + `(${m.captured[0].filter((x) => x.rank === "X" || x.rank === "Ász").length * 10}–${m.captured[1].filter((x) => x.rank === "X" || x.rank === "Ász").length * 10}). `
    + (got.length ? `Captured ${got.length}: ${got.map(cardName).join(", ")}.` : "Nothing captured.")
    + (m.generated.length ? ` Travelling Merchant brought ${m.generated.map((x) => `${x.suit} VIII (Refinement I)`).join(", ")}.` : ""), m.result === "lose" ? "warn" : "good");
  const after = state.match.after, deal = state.match.deal, partnerAi = state.match.partnerAi; state.match = null;
  if (deal) settleDeal(state, deal, got, partnerAi);                     // before recruitment, so a sold card can't be recruited
  postMatch(state, got, after || (() => { state.phase = "location"; endRound(state); }));
}

// ---------------------------------------------------------------- after a match (D-732 steps 5, 6, 8)
// (5) recruitment: at most one captured card moves from cargo into the personal deck, added or swapped (D-025, D-319);
// (6) overflow (D-265); (8) the 8-card survival check (D-138, D-141). Cards generated during the match (Travelling
// Merchant) aren't captures, so they can't be recruited.
function postMatch(state, captured, next) {
  const after = () => afterIncoming(state, () => { if (lostRun(state)) return; next(); }, true);
  if (!captured.length) return after();
  state.recruit = { eligible: captured, after };
  state.phase = "recruit";
}

function recruit(state, action) {
  const c = state.caravan, { eligible, after } = state.recruit;
  const card = eligible[action.i];
  if (!card || !c.cargo.includes(card)) throw new Error("not an eligible captured card");
  const capBefore = capacity(c);
  c.cargo.splice(c.cargo.indexOf(card), 1);
  if (action.swap != null) {
    const out = c.personal[action.swap]; if (!out) throw new Error("no such personal card");
    c.personal.splice(action.swap, 1, card);
    c.cargo.push(out);   // D-868: the swapped-out card goes into cargo; it's still yours
    note(state, `Recruited ${cardName(card)} into your personal deck, swapping out ${cardName(out)}, which goes into cargo (D-868).`);
  } else {
    c.personal.push(card);
    note(state, `Recruited ${cardName(card)} into your personal deck (D-319: it leaves cargo).`);
  }
  c.capacity = capacity(c);
  if (c.capacity < capBefore) note(state, `Capacity drops from ${capBefore} to ${c.capacity}: Farmer's Papers is no longer in your personal deck.`, "warn");
  if (c.capacity > capBefore) note(state, `Capacity rises from ${capBefore} to ${c.capacity}: Farmer's Papers is back in your personal deck.`, "good");
  state.recruit = null; after();
}

function upgrade(state, opts, action) {
  const a = opts.actions.find((x) => x.type === "upgrade" && x.deck === action.deck && x.i === action.i && x.track === action.track);
  if (!a || !a.allowed) throw new Error("upgrade not available");
  const c = state.caravan, card = c[a.deck][a.i], before = cardName(card);
  c.coins -= a.price; applyUpgrade(card, a.track); c.capacity = capacity(c);
  if (a.track === "refine") afterRefine(state, card);
  // an adjective bought as a card upgrade unlocks it as a title (D-740); the profile keeps it (D-744)
  if (a.track !== "refine" && card.adjective && state.run) { (state.run.titles ||= []); if (!state.run.titles.includes(card.adjective)) state.run.titles.push(card.adjective); }
  note(state, `${a.at}: ${a.track === "refine" ? "refined" : "gave the adjective"} ${before} → ${cardName(card)} for ${a.price} coins [DRAFT price]. ${a.gives}`, "good");
}

// ================================================================ road encounters (D-678 B4; encounters.js)
const growl = (state, text) => note(state, text, "growl");      // the Growl convention: minor news, no screen (D-798)
const roadDone = (state) => { state.event = null; state.phase = "declare"; endRound(state); };

function localSuits(state, here) {
  // "suits of the surrounding area": approximated by the suits of the stops on either side of this encounter point
  const near = new Set();
  for (const l of state.legsFrom[here.id] || []) for (const x of state.stops[l.to].suits || []) near.add(x);
  for (const l of state.board.legs) if (l.to === here.id) for (const x of state.stops[l.from].suits || []) near.add(x);
  return near.size ? [...near] : SUITS;
}
function parallelStops(state, here) {
  return state.board.stops.filter((s) => s.stop === here.stop && s.id !== here.id && !["start", "checkpoint", "entry"].includes(s.kind));
}

// True Path (Unerring Beasts Ász in the personal deck): a combat encounter rolled is rerolled once; the second roll is final
const COMBAT = new Set(["Bandits ambush", "Beasts ambush", "deserters"]);
function drawEvent(state, here) {
  const c = state.caravan, ctx = { parallelStops: parallelStops(state, here), military: military(c) };
  const opts = E.drawable(here, ctx);
  if (!opts.length) return null;
  let ev = state.rng.weighted(opts, ([, p]) => p)[0];
  // Swift (Swift Wild Horse line in the personal deck; the best one): a hostile road encounter rolled: 50 % to reroll once;
  // without a reroll, Plains Horse 1 % / Courser 3 % per Plainsfolk card in cargo (cap 10 % / 30 %) to avoid it; resolves
  // before True Path, each once (D-599, D-600); roll bonuses add on top of the caps (D-598)
  const horse = c.personal.filter((x) => ALT.horse(x) && x.adjective === "Swift").sort((a, b) => (b.refined || 0) - (a.refined || 0))[0];
  if (horse && COMBAT.has(ev)) {
    if (state.rng.next() < luck(state, 0.5)) { const again = state.rng.weighted(opts, ([, p]) => p)[0]; note(state, `Swift: your horse turns you aside from the ${ev}${again === ev ? ", but it waits on the other road too" : ""}.`, again === ev ? "warn" : "good"); ev = again; }
    else if (horse.refined >= 1) {
      const per = horse.refined >= 2 ? 0.03 : 0.01, cap = horse.refined >= 2 ? 0.3 : 0.1;
      const p = Math.min(cap, per * c.cargo.filter((x) => x.suit === "Plainsfolk").length);
      if (p > 0 && state.rng.next() < luck(state, p)) { note(state, `Swift: you outride the ${ev} altogether.`, "good"); return null; }
    }
  }
  // Booming (Booming Bustard line, personal deck; the most refined one, no stacking): a non-combat encounter rolled: Bustard 75 %,
  // Great Bustard 50 %, Túzok 25 % for one reroll; the new result stands; no Good Fortune (an unfavourable outcome, D-378). Booming and
  // True Path each reroll at most once, in the order the rolls call for (D-517 to D-521)
  const bird = c.personal.filter(AGRI.booming).sort((a, b) => (b.refined || 0) - (a.refined || 0))[0];
  let boomed = false, pathed = false;
  for (let k = 0; k < 2; k++) {
    if (bird && !boomed && !COMBAT.has(ev)) {
      boomed = true;
      if (state.rng.next() < [0.75, 0.5, 0.25][bird.refined || 0]) { const again = state.rng.weighted(opts, ([, p]) => p)[0]; note(state, `Booming: the bustard's calls carry, and the road changes: ${again}.`, COMBAT.has(again) ? "warn" : "info"); ev = again; }
    }
    if (COMBAT.has(ev) && !pathed && c.personal.some(BEASTS.unerring)) {
      pathed = true;
      const again = state.rng.weighted(opts, ([, p]) => p)[0];
      note(state, `True Path: the White Stag leads you around the ${ev}${again === ev ? ", but the same danger waits" : ""}.`, again === ev ? "warn" : "good");
      ev = again;
    }
  }
  return ev;
}
function foresee(state, stop) {
  state.foreseen ||= {};
  if (!(stop.id in state.foreseen)) state.foreseen[stop.id] = drawEvent(state, stop);
  return state.foreseen[stop.id];
}
function roadEncounter(state, here) {
  const c = state.caravan;
  const known = state.foreseen && here.id in state.foreseen;
  const ev = known ? state.foreseen[here.id] : drawEvent(state, here);
  if (state.foreseen) state.foreseen = {};                       // what lay ahead is redrawn after you move on
  if (!ev) { note(state, "Encounter point: a quiet stretch of road."); return roadDone(state); }
  const local = localSuits(state, here);
  state.event = { name: ev, local };
  note(state, `Encounter point: ${ev}.`, "event");
  const r = state.rng, P = PLACEHOLDER.enc;
  switch (ev) {
    case "found treasure": {                                    // D-804: passive, one category, value by the stop number
      const kind = r.weighted(Object.entries(P.treasureWeights), ([, w]) => w)[0];
      if (kind === "coins") { const n = P.treasureCoinsPerStop * here.stop; c.coins += n; growl(state, `Found treasure: ${n} coins.`); }
      else {
        const card = kind === "commodity" ? E.baseCommodity(r, local) : { rank: r.pick(RANKS_), suit: r.pick(ALL_SUITS_), refined: 1 };   // an already upgraded card, any suit (D-804)
        c.cargo.push(card); growl(state, `Found treasure: ${cardName(card)}.`);
        return afterIncoming(state, () => roadDone(state));          // a full wagon: the normal overflow selection (D-871 (2))
      }
      return roadDone(state);
    }
    case "blocked road": {                                      // D-793, D-794, D-806 (16): mandatory diversion
      const to = r.pick(parallelStops(state, here));
      c.at = to.id; c.onHighway = false; state.visited.add(to.id);   // the next highway entry pays its toll (D-837)
      note(state, `The road ahead is blocked (flood or landslide). You are diverted to ${describe(to)}, also stop ${to.stop}; your journey continues from there.`, "warn");
      state.event = null;
      return arrive(state);                                            // a normal arrival at the destination (D-871 (4))
    }
    case "travelling peddler":                                  // D-678 B4: two random base commodities; buys commodities (D-796)
      state.event.stock = Array.from({ length: P.peddlerStock }, () => E.baseCommodity(r, r.next() < P.peddlerOutsideChance ? ALL_SUITS_.filter((x) => !local.includes(x)) : local));
      break;
    case "travelling mercenaries":                              // D-806 (14): a roster mercenary you don't own, for discounted recruitment
      { const notOwned = MERCS.filter((x) => !c.personal.some((y) => y.merc === x.id)); state.event.offer = notOwned.length ? r.pick(notOwned).id : null; }
      break;
    case "inn":                                                 // D-807, D-811
      { const refined = (pred) => E.stagesOf((s) => s.stage >= 1 && (s.tags.includes("food") || s.tags.includes("drink")) && pred(s));
        const opts = refined((s) => local.includes(s.suit)).length ? refined((s) => local.includes(s.suit)) : refined(() => true);
        state.event.stock = Array.from({ length: P.innStock }, () => E.cardFromStage(r.pick(opts))); }
      break;
    case "King's Men patrol":
      state.event.mode = roadMilitary(c) > 2 ? "help" : roadMilitary(c) >= 2 ? "trade" : "inspect";   // D-803 (b) average 2: trade; (c) above 2: help
      // (a) below 2: a routine cargo inspection, then a warning about bandits nearby; the minor checkpoint's rule (D-923, D-808): a 2-card
      // spot check, any X or Ász found → surrender them (a second check follows) or fight (a cargo ambush against King's Men)
      if (state.event.mode === "inspect") { note(state, "A King's Men patrol stops you for a routine look at your cargo (D-803).", "warn"); return minorCheck(state, 2, 1); }
      if (state.event.mode === "trade") state.event.stock = Array.from({ length: P.patrolStock }, () => E.cardFromStage(r.pick(E.tagged("military", (s) => s.stage === 0 && s.roster === "main"))));
      break;
    case "lost traveller":
      if (c.passenger || slots(c) >= c.capacity) { /* one passenger at a time: a reading, not ruled */ note(state, "A lost traveller asks for a ride, but there's no free slot in the wagon (D-799)."); return roadDone(state); }
      break;
    case "Bandits ambush": case "Beasts ambush": return startAmbush(state, ev, false);
    case "deserters": {                                         // D-801 (9): strictly stronger caravan -> 50 % they flee
      if (roadMilitary(c) > P.hostileMilitary["King's Men"] && r.next() < luck(state, 0.5)) {
        const left = r.pick(E.hostilePool(r, "deserters", local)); c.cargo.push(left);
        note(state, `Deserters! Seeing your escort, they flee, leaving ${cardName(left)} behind.`, "good");
        return afterIncoming(state, () => roadDone(state));
      }
      note(state, "Deserters block the road and attack.", "warn");
      return startAmbush(state, "deserters", false);
    }
    case "minor checkpoint": {                                  // D-806 (15), D-808: 0-32 occupied slots -> a 2-card spot check
      if (slots(c) >= 33) { note(state, `A minor checkpoint. Your wagon is packed (${slots(c)} slots): the guards can't be bothered and wave you through.`, "good"); return roadDone(state); }
      return minorCheck(state, 2, 1);
    }
    case "travelling craftsman": {                              // D-796, D-882: one free refinement on a card of his suit
      const suit = r.pick(local);
      const cands = ["cargo", "personal"].flatMap((deck) => c[deck].map((card, i) => ({ deck, i, card })))
        .filter((x) => x.card.suit === suit).map((x) => ({ ...x, offer: craftOffer(x.card) })).filter((x) => x.offer);
      state.event.suit = suit; state.event.cands = cands;
      if (!cands.length) { note(state, `A travelling ${suit} craftsman offers a free refinement, but none of your ${suit} cards is one he can work on.`); return roadDone(state); }
      break;
    }
    case "dubious toll collectors": state.event.backOff = roadMilitary(c) > P.hostileMilitary["King's Men"]; break;
    default: break;   // broken-down caravan, abandoned wagon: choices in eventOptions
  }
  state.phase = "event";
}
const ALL_SUITS_ = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Beasts", "Bandits", "Townsfolk", "King's Men", "Hillfolk", "Carnivalfolk", "Fisherfolk", "Plainsfolk"];

function eventOptions(state) {
  const c = state.caravan, ev = state.event, here = state.stops[c.at], P = PLACEHOLDER.enc;
  const acts = ev.name === "dubious toll collectors" && !ev.backOff ? [] : [{ type: "leave" }];   // D-809: pay, search, or fight
  const free = slots(c) < c.capacity;
  const buy = (stock, mult = 1) => stock.forEach((card, i) => { const price = Math.ceil(cardValue(card) * buyMult(ev.local, card) * mult * (1 - peddlerDiscount(card)) * INFL); acts.push({ type: "buy", i, card, price, allowed: c.coins >= price && free }); });
  const sell = (test, mult = 1) => c.cargo.forEach((card, i) => { if (test(card)) acts.push({ type: "sell", i, card, bundle: mates(c, card).length, price: priceOf(c, card, (x) => Math.max(1, Math.ceil(cardValue(x) * sellMult(ev.local, x) * mult * INFL))), endsRun: counted(c) - countedOut(mates(c, card)) < RULES.cargoMinimum }); });
  switch (ev.name) {
    case "travelling peddler": buy(ev.stock); sell(E.isCommodity); break;
    case "travelling mercenaries": {
      // no mercenary: discounted recruitment; already employing one: recruit another or upgrade the current one; or decline (D-806 (14))
      const M = PLACEHOLDER.merc, d = M.roadDiscount;
      if (ev.offer != null) { const price = Math.ceil(M.hire * d); acts.push({ type: "road-hire", i: 0, merc: ev.offer, card: mercCard(ev.offer), price, allowed: c.coins >= price }); }
      c.personal.filter((y) => y.merc && y.stage < 3).forEach((x, k) => { const price = Math.ceil(M.packages[x.stage] * d); acts.push({ type: "road-merc-upgrade", i: k, merc: x.merc, card: x, next: MERCS.find((y) => y.id === x.merc).stages[x.stage + 1], price, allowed: c.coins >= price }); });
      break; }
    case "inn": buy(ev.stock, P.innMarkup); sell((x) => !x.refined && E.tagsOf(x).some((t) => ["food", "drink", "livestock"].includes(t)), P.innDiscount); break;
    case "lost traveller": acts.push({ type: "take-passenger" }); break;
    case "broken-down caravan":
      acts.push({ type: "give-money", amount: P.brokenDownMoney, allowed: c.coins >= P.brokenDownMoney });
      c.cargo.forEach((card, i) => { if (E.isCommodity(card) || card.rank === "Alsó" || card.rank === "Felső") acts.push({ type: "give-card", i, card, endsRun: counted(c) - countedOut([card]) < RULES.cargoMinimum }); });
      break;
    case "abandoned wagon": acts.push({ type: "search" }); break;
    case "pilgrims": case "festival": acts.push({ type: "friendly" }); break;     // optional friendly short match (D-795)
    case "travelling craftsman": ev.cands.forEach((x, i) => acts.push({ type: "craft", i, card: x.card, to: x.offer.to })); break;
    case "minor checkpoint": acts.length = 0; acts.push({ type: "mc-fight" }, { type: "mc-surrender" }); break;
    case "King's Men patrol":
      if (ev.mode === "inspect") { acts.length = 0; acts.push({ type: "mc-fight" }, { type: "mc-surrender" }); break; }
      if (ev.mode === "trade") buy(ev.stock); else acts.push({ type: "help" });
      break;
    case "dubious toll collectors":
      if (ev.backOff) acts.push({ type: "confront" });
      else acts.push({ type: "pay-toll", amount: P.tollAmount, allowed: c.coins >= P.tollAmount }, { type: "spot-check" }, { type: "refuse" });
      break;
  }
  acts.push(...profiteerShop(state, "road"));
  return { phase: "event", here, event: ev, actions: acts, slotsFree: c.capacity - slots(c) };
}

function eventAct(state, opts, action) {
  const c = state.caravan, ev = state.event, r = state.rng, P = PLACEHOLDER.enc;
  const a = opts.actions.find((x) => x.type === action.type && (x.i === undefined || x.i === action.i));
  if (!a) throw new Error(`illegal action ${action.type} at ${ev.name}`);
  if (a.allowed === false) throw new Error("not affordable");
  switch (a.type) {
    case "leave":
      if (ev.name === "dubious toll collectors" && !ev.backOff) throw new Error("pay, submit to the spot check, or refuse");
      note(state, ev.name === "abandoned wagon" ? "You leave the wagon alone." : `You move on.`); return roadDone(state);
    case "road-hire": c.coins -= a.price; c.personal.push(mercCard(a.merc)); c.capacity = capacity(c); note(state, `${a.card.name} joins you on the road for ${a.price} coins (discounted, D-806).`, "good"); return roadDone(state);
    case "road-merc-upgrade": { c.coins -= a.price; const k = c.personal.indexOf(a.card); c.personal[k] = mercCard(a.merc, a.card.stage + 1); note(state, `On the road, ${a.card.name} becomes ${a.next} for ${a.price} coins (discounted, D-806).`, "good"); return roadDone(state); }
    case "buy": c.coins -= a.price; c.cargo.push(ev.stock.splice(a.i, 1)[0]); note(state, `Bought ${cardName(a.card)} for ${a.price} coins.`); return;
    case "sell": removeCargo(c, c.cargo[a.i]); c.coins += a.price + bundling(state, a.card, a.price); note(state, `Sold ${cardName(a.card)} for ${a.price} coins.`); lostRun(state); return;
    case "help": note(state, "You join the patrol against the bandits nearby: a standard Zsír encounter (D-803).");
      return startLocationMatch(state, ["King's Men", "Bandits", ...ev.local.filter((x) => x !== "King's Men" && x !== "Bandits").slice(0, 2)], c.at, () => roadDone(state), E.poiDeckCard(state.rng, null, null));
    case "take-passenger": c.passenger = true; note(state, "A lost traveller rides with you to the next settlement; they take one wagon slot (D-421)."); return roadDone(state);
    case "give-money": {                                         // D-797: money returns a random upgraded card, any rank and suit
      c.coins -= a.amount; const got = { rank: r.pick(RANKS_), suit: r.pick(ALL_SUITS_), refined: 1 };
      c.cargo.push(got); note(state, `You give ${a.amount} coins. In thanks: ${cardName(got)} (upgraded).`, "good");
      return afterIncoming(state, () => roadDone(state));
    }
    case "give-card": {                                          // D-796: commodity -> upgraded commodity; Alsó/Felső -> upgraded same rank
      c.cargo.splice(a.i, 1);
      const got = E.isCommodity(a.card) ? E.cardFromStage(r.pick(E.stagesOf((s) => s.stage >= 1)))
                                          : { rank: a.card.rank, suit: r.pick(ALL_SUITS_), refined: 1 };
      c.cargo.push(got); note(state, `You give ${cardName(a.card)}. In thanks: ${cardName(got)} (upgraded).`, "good");
      return roadDone(state);
    }
    case "craft": {
      const x = ev.cands[a.i], card = c[x.deck][x.i], before = cardName(card); applyUpgrade(card, "refine"); c.capacity = capacity(c); afterRefine(state, card);
      note(state, `The ${ev.suit} craftsman refines ${before} into ${cardName(card)}, free of charge.`, "good"); return roadDone(state);
    }
    case "mc-fight": note(state, ev.name === "King's Men patrol" ? "You fight the patrol (D-923: the minor checkpoint's rule)." : "You fight the minor checkpoint's guards (D-808).", "warn"); return startAmbush(state, "minor checkpoint", false);
    case "mc-surrender": {
      const { n } = ev.inspection, found = fieldMedicine(state, ev.inspection.found);
      for (const d of found) { const deck = d.from === "cargo" ? c.cargo : c.personal; deck.splice(deck.indexOf(d.card), 1); }
      if (found.length) note(state, `Surrendered ${found.map((d) => cardName(d.card)).join(", ")}.`, "warn"); c.capacity = capacity(c);
      if (lostRun(state)) return;
      if (n === 1) return minorCheck(state, r.pick(PLACEHOLDER.secondInspectionSizes), 2);   // a second draw (D-137)
      return roadDone(state);
    }
    case "friendly": {                                           // D-795, D-881: personal decks, 2 tricks, Zsír points
      const faction = ev.name === "pilgrims" ? "Clergy" : "Carnivalfolk";
      const dep = deployed(c), m = friendlyMatch({ rng: r, playerPersonal: dep.personal, faction, value: cardValue, companion: dep.companion });
      m.richer = wealthTest(state, [state, null, state, null]);
      state.match = { m, at: c.at, kind: "friendly", event: ev.name }; state.phase = "match";
      note(state, `A friendly match against the ${ev.name === "pilgrims" ? "pilgrims" : "festival crowd"}: your personal deck against theirs, two tricks, Zsír points decide.`); return;
    }
    case "search":                                               // D-804, D-805
      if (r.next() < 0.5) { note(state, "Bandits were waiting by the wagon!", "bad"); return startAmbush(state, "Bandits ambush", false); }
      {
        const loc = ev.local, oneX = r.next() < luck(state, 0.1), five = [];
        for (let k = 0; k < 5; k++) five.push(E.cardFromStage(r.pick(E.stagesOf((s) => s.stage === 0 && s.roster === "main" && loc.includes(s.suit) && s.rank === (oneX && k === 0 ? "X" : "VIII")))));
        c.cargo.push(...five); note(state, `The wagon holds five commodities: ${five.map(cardName).join(", ")}.`, "good");
        return afterIncoming(state, () => roadDone(state));
      }
    case "pay-toll": c.coins -= a.amount; note(state, `Paid the toll collectors ${a.amount} coins.`); return roadDone(state);
    case "spot-check": {                                         // D-808, D-809: 2 cards; contraband -> cargo ambush
      const pool = [...c.cargo, ...c.personal], drawn = [];
      for (let k = 0; k < 2 && pool.length; k++) drawn.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]);
      const found = drawn.filter((x) => x.rank === "X" || x.rank === "Ász");
      note(state, `Spot check: ${drawn.map(cardName).join(", ")}.${found.length ? " Contraband!" : " Nothing found; they let you pass."}`, found.length ? "bad" : "good");
      if (found.length) return startAmbush(state, "dubious toll collectors", false);
      return roadDone(state);
    }
    case "refuse": note(state, "You refuse both the toll and the search.", "warn"); return startAmbush(state, "dubious toll collectors", false);
    case "confront": note(state, "They back off, but you confront them (D-801).", "warn"); return startAmbush(state, "dubious toll collectors", true);
  }
}
const RANKS_ = ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"];

// win: the event's prize (D-797: Pilgrims, one random upgraded non-Zsír Clergy card; D-805: Festival, one random commodity X,
// base); loss or draw: nothing beyond the missed prize; no captures change hands (D-881)
function finishFriendly(state) {
  const { m, event } = state.match, c = state.caravan, r = state.rng, a = zscore(m, 0), b = zscore(m, 1); c.lastMatch = m.result;
  note(state, `Friendly match ${m.result === "win" ? "won" : m.result === "lose" ? "lost" : "drawn"} (${a.points}–${b.points}${a.points === b.points ? `, value ${a.value}–${b.value}` : ""}).`, m.result === "win" ? "good" : "info");
  state.match = null;
  if (m.result !== "win") return roadDone(state);
  let prize;
  if (event === "pilgrims") {
    const rank = r.pick(["VII", "VIII", "IX", "Alsó", "Felső", "Király"]);   // "non-Zsír": not X or Ász (D-797)
    const st = E.stagesOf((s) => s.suit === "Clergy" && s.rank === rank && s.stage >= 1);
    prize = st.length ? E.cardFromStage(r.pick(st)) : { rank, suit: "Clergy", refined: 1 };
  } else prize = E.cardFromStage(r.pick(E.stagesOf((s) => s.rank === "X" && s.stage === 0)));   // a random commodity X, base (D-805)
  c.cargo.push(prize); note(state, `Your prize: ${cardName(prize)}.`, "good");
  afterIncoming(state, () => roadDone(state));
}

// the minor checkpoint's spot check, under the checkpoint inspection rules (D-134, D-136, D-737: no Bribe without an ability)
function minorCheck(state, size, n) {
  const c = state.caravan, pool = [...c.cargo.map((card) => ({ card, from: "cargo" })), ...c.personal.map((card) => ({ card, from: "personal" }))], drawn = [];
  for (let k = 0; k < size && pool.length; k++) drawn.push(pool.splice(Math.floor(state.rng.next() * pool.length), 1)[0]);
  const found = drawn.filter((d) => d.card.rank === "X" || d.card.rank === "Ász");
  const who = state.event?.name === "King's Men patrol" ? "Patrol" : "Minor checkpoint";
  note(state, `${who}, ${n === 1 ? "spot check" : "second check"} (${size} cards): ${drawn.map((d) => cardName(d.card)).join(", ")}.${found.length ? " Contraband!" : " Nothing found; on you go."}`, found.length ? "bad" : "good");
  if (!found.length) { if (who === "Patrol") note(state, "Before they ride off, the patrol warns you: bandits about in these parts (D-803)."); return roadDone(state); }
  state.event.inspection = { found, n }; state.phase = "event";
}
// what a travelling craftsman can do for a card: its next refinement stage, if the build supports it (D-882)
function craftOffer(card) {
  const e = upgradeEntry(card); if (!e) return null;
  const r = card.refined || 0; return r < e.stages.length - 1 ? { to: e.stages[r + 1] } : null;
}

function deliverPassenger(state, here) {                         // D-798, D-799: leaves at the next settlement; reward by Growl
  const c = state.caravan, P = PLACEHOLDER.enc; c.passenger = false;
  if (state.rng.next() < luck(state, P.travellerReward.coinsChance)) { c.coins += P.travellerReward.coins; growl(state, `Your passenger thanks you in ${here.name} and leaves ${P.travellerReward.coins} coins.`); }
  else { const card = { rank: state.rng.pick(RANKS_), suit: state.rng.pick(ALL_SUITS_) }; /* "a random card" (D-798), base */ c.cargo.push(card); growl(state, `Your passenger thanks you in ${here.name} and leaves ${cardName(card)} in their slot.`); }
}

// ---------------------------------------------------------------- the cargo ambush (D-174 to D-227, D-800, D-801)
const FACTION = { "Bandits ambush": "Bandits", "Beasts ambush": "Beasts", "dubious toll collectors": "King's Men", deserters: "King's Men", "minor checkpoint": "King's Men" };
// a caravan as the other side (D-184, D-202 escalation, D-222): its own cargo is the pool, its military counts, its owner and companion
// play from its personal deck; afterwards the round goes on where it was (the meeting comes after the stop's event, D-731)
export function startCaravanAmbush(state, rival, playerAmbushes) {
  state.ambushRival = rival; state.event = { local: state.stops[state.caravan.at].suits || SUITS };
  return startAmbush(state, rival.ai.name, playerAmbushes, rival);
}
function startAmbush(state, kind, playerAmbushes, rival = null) {
  const c = state.caravan, faction = rival ? rival.ai.civ : FACTION[kind], local = state.event?.local || SUITS;
  // Wild Deterrent (Calloused Spearfisher line, personal deck): a Beasts ambush where Fisherfolk live is repelled: a win, no spoils
  if (faction === "Beasts" && local.includes("Fisherfolk") && c.personal.some(FISH.calloused)) { note(state, "Wild Deterrent: the spears come out and the beasts think better of it (no spoils).", "good"); return roadDone(state); }
  const pool = rival ? rival.caravan.cargo : E.hostilePool(state.rng, kind, local);
  // Establishing the Law (Pusztabíró in the personal deck): +1 military against Bandits each, at most +2
  const law = (faction === "Bandits" ? Math.min(2, c.personal.filter(PLAINS.pusztabiro).length) : 0)
    // Familiar Roads (Local rural Spearman, cargo or personal deck): 1.5 Sevens against Bandits or Beasts (D-542, D-744)
    + (faction === "Bandits" || faction === "Beasts" ? 0.5 * [...c.cargo, ...c.personal].filter(RURAL.local).length : 0);
  // Marching Formation (Marching Orders in the personal deck): a military bonus in road encounters (amount PLACEHOLDER)
  const formation = roadMilitary(c) - military(c);
  // Untrained (Unpredictable rural Townsfolk VII): each one's military is rolled for this ambush, 0 / 1 / 2 (Volunteer 40 / 50 / 10 %,
  // Bellman 35 / 50 / 15 %); Good Fortune, Lard and Crooked raise only the double (D-613, D-614); suspicion still counts 1
  let untrained = 0;
  for (const x of [...c.cargo, ...c.personal].filter(RURAL_T.untrained)) {
    const u = state.rng.next(), p2 = luck(state, x.refined >= 1 ? 0.15 : 0.1), p0 = x.refined >= 1 ? 0.35 : 0.4;
    untrained += u < p2 ? 1 : u < p2 + p0 ? -1 : 0;
  }
  if (untrained) note(state, `Untrained: your volunteers ${untrained > 0 ? "rise to the occasion" : "falter"} (${untrained > 0 ? "+" : ""}${untrained} military).`, untrained > 0 ? "good" : "warn");
  // Beast Defence (Proud / Star-Eyed Shepherd, personal deck): extra military against Beasts, every Shepherd counts (D-903;
  // amount PLACEHOLDER, D-628 balancing)
  const shepherd = faction === "Beasts" ? c.personal.filter(RURAL_T.proud).length * PLACEHOLDER.beastDefence : 0;
  // Local Support (Fisherman's Papers, personal deck): +1 military at stops where Fisherfolk live
  const fishHere = (state.event?.local || state.stops[c.at]?.suits || []).includes("Fisherfolk");
  const support = (fishHere && c.personal.some(FISH.papers) ? 1 : 0)
    // the Lurker (mercenary #1, from Lurker): +1 military in encounters at stops where Forestfolk live; not checkpoints (D-372)
    + ((state.event?.local || state.stops[c.at]?.suits || []).includes("Forestfolk") && c.personal.some(MERC.lurker) ? 1 : 0);
  const milO = rival ? military(rival.caravan) : PLACEHOLDER.enc.hostileMilitary[faction], milP = Math.max(0, military(c) + law + formation + untrained + shepherd + support);
  let [needP, needO] = E.exposure(c.cargo.length, milP, pool.length, milO);
  if (formation) note(state, `Marching Formation: +${formation} military on the road.`, "good");
  // Run Them Down! (Charger 10 %, Nightmare 25 %, personal deck): negates the EXTRA exposure from military inferiority; the
  // baseline still applies and the opponent's exposure doesn't rise (D-183, D-198). Under D-880 the extra is the doubling
  // when you're more than 2x weaker; at 1.5x-2x you already expose only the base, so there's nothing to negate
  const horse = Math.max(0, ...c.personal.filter(KINGS.charger).map((x) => (x.refined >= 2 ? 0.25 : 0.1)));
  const baseP = Math.min(Math.floor(c.cargo.length / 4), c.cargo.length);
  if (horse && needP > baseP) {
    if (state.rng.next() < luck(state, horse)) { needP = baseP; note(state, `Run Them Down! Your cavalry charges: you risk only the base ${baseP} cards, not double (D-183).`, "good"); }
    else note(state, `Run Them Down! The charge doesn't break them (${Math.round(horse * 100)}%).`);
  }
  state.ambush = { kind, faction, pool, local, milP, milO, needP, needO, picked: [], playerAmbushes, groups: E.groupsOf(state.rng, c.cargo), rival };
  if (law) note(state, `Local knowledge and the law add ${law} military against the ${faction}.`, "good");
  // Breakaway (Elusive Plainsfolk Felső in the personal deck): at the start of a non-checkpoint conflict, a chance to escape:
  // Horsebreaker 50 %, Csikós 100 %; success avoids it (no rewards), failure plays it normally; copies don't stack
  const riders = c.personal.filter(PLAINS.elusive);
  if (riders.length && !playerAmbushes) {                       // the minor checkpoint's fight is a road fight too (D-808)
    state.ambush.breakaway = riders.some((x) => x.refined >= 1) ? 1 : 0.5; state.phase = "breakaway";
    note(state, `${kind}: your horseman could try to break away (${Math.round(state.ambush.breakaway * 100)}%).`); return;
  }
  continueAmbush(state);
}
function continueAmbush(state) {
  const { kind, milP, milO, needP, needO, pool } = state.ambush;
  const why = needP === 0 && needO > 0 ? "you far outgun them, so none of your cargo is at risk"
            : needO === 0 && needP > 0 ? "they far outgun you, so only your cargo is at risk" : "you're evenly matched";
  note(state, `${kind}: your military ${milP} against their ${milO}: ${why}. You expose ${needP} cargo card${needP === 1 ? "" : "s"}, they expose ${needO} of their ${pool.length} (D-880).`, "warn");
  state.phase = "expose";
  if (!needP) launchAmbush(state);
}
function exposePick(state, i) {
  const a = state.ambush, need = a.needP - a.picked.length;
  let g = a.groups[i];
  if (g.length > need) g = E.groupsOf(state.rng, g)[0].slice(0, need);   // partial final group: procedure open (ENC-30); PLACEHOLDER random
  a.picked.push(...g);
  if (a.picked.length >= a.needP) return launchAmbush(state);
  a.groups = E.groupsOf(state.rng, state.caravan.cargo.filter((x) => !a.picked.includes(x)));   // reshuffle after each pick (D-177)
}
function exposeTimeout(state) {                                   // D-177: on expiry the rest is chosen at random
  const a = state.ambush, rest = E.groupsOf(state.rng, state.caravan.cargo.filter((x) => !a.picked.includes(x))).flat();
  a.picked.push(...rest.slice(0, a.needP - a.picked.length));
  note(state, "Time's up: the rest of your exposed cargo is chosen at random (D-177).", "warn");
  launchAmbush(state);
}
// Detonation (Black Powder 33 %, Powder Keg 66 %; cargo and personal deck; regardless of adjective): once when a road fight's
// Zsír is decided, or a checkpoint Fight; any success ends the run; nothing lowers it (D-633 to D-635)
function detonates(state) {
  const c = state.caravan, kegs = [...c.cargo, ...c.personal].filter((x) => ALT.saltpetre(x) && (x.refined || 0) >= 1);
  for (const x of kegs) if (state.rng.next() < (x.refined >= 2 ? 0.66 : 0.33)) {
    state.ended = { won: false, reason: `Detonation: the ${cardName(x)} goes off in the fighting. The caravan is gone. The run ends.` };
    note(state, state.ended.reason, "bad"); state.ambush = null; return true;
  }
  return false;
}
function launchAmbush(state) {
  if (detonates(state)) return;
  const a = state.ambush, r = state.rng;
  const oppExposed = E.groupsOf(r, a.pool).flat().slice(0, a.needO); a.exposedOpp = oppExposed;
  const deck = [...a.picked.map((x) => zcard(x.rank, x.suit, { ...x, own: "player", ref: x })), ...oppExposed.map((x) => zcard(x.rank, x.suit, { ...x, own: "opp", ref: x }))];
  const combined = deck.length;
  while (deck.length < 16) deck.push(zcard(r.pick(["VII", "VIII", "IX", "Alsó", "Felső", "Király"]), r.pick(a.local), { own: "gen" }));   // D-227, D-253
  const dep = deployed(state.caravan);
  const m = ambushMatch({ rng: r, deck, playerPersonal: dep.personal, faction: a.faction, value: cutValue, wanted: state.requirement?.test, companion: dep.companion,
                          ...(a.rival ? { opponentPersonal: a.rival.caravan.personal, names: ["You", a.rival.ai.name, "Companion", `${a.rival.ai.civ} companion`] } : {}),
                          trickLimit: E.ambushTrickLimit(combined), onPlay: onPlay(r), onTrick: onTrick(state.rng, state.caravan.personal, state.caravan.cargo), leaderSide: a.playerAmbushes ? 0 : 1 });
  note(state, `The deck: ${a.picked.length} of your cards, ${oppExposed.length} of theirs${deck.length > combined ? `, topped up with ${deck.length - combined} local cards (D-227)` : ""}; at most ${m.trickLimit} tricks (D-220).`);
  m.richer = wealthTest(state, [state, a.rival, state, a.rival]); if (dep.companion) m.mercHalf = dep.companion.half;
  state.match = { m, at: state.caravan.at, kind: "ambush" }; state.phase = "match";
}
function finishAmbush(state) {
  const { m } = state.match, a = state.ambush, c = state.caravan, o = ambushOutcome(m); mercShare(state, m);
  for (let k = Math.min(2, c.personal.filter(FARMFOLK.wary).length); k > 0; k--) {         // Herd Protection: one Farmfolk produce card each
    const cand = o.lost.filter((x) => FARMFOLK.produce(x));
    if (!cand.length) break;
    const saved = state.rng.pick(cand); o.lost.splice(o.lost.indexOf(saved), 1);
    note(state, `Herd Protection: your Hajdú saves ${cardName(saved)}.`, "good");
  }
  // Preservation (Fortified Honey or Mead in cargo): each protects one other cargo card from loss in this road encounter
  // Making a List (Supple Parchment in the personal deck): ambushes only, one random cargo card each, two copies at most (D-571, D-572)
  for (let k = Math.min(2, c.personal.filter((x) => ALT.parchment(x) && x.adjective === "Supple").length); k > 0 && o.lost.length; k--) {
    const saved = state.rng.pick(o.lost); o.lost.splice(o.lost.indexOf(saved), 1); note(state, `Making a List: ${cardName(saved)} is on the list and stays.`, "good");
  }
  // (each Fortified card saves one OTHER card: another Fortified card can be saved; D-415: protections stack, saved at random)
  const fort = c.cargo.filter(BEASTS.fortified);
  for (let k = fort.length; k > 0; k--) {
    const cand = o.lost.filter((x) => !(fort.length === 1 && (x.ref || x) === fort[0]));
    if (!cand.length) break;
    const saved = state.rng.pick(cand); o.lost.splice(o.lost.indexOf(saved), 1);
    note(state, `Preservation: the honey keeps ${cardName(saved)} safe.`, "good");
  }
  // Field Medicine (Restorative Clergy VIII in cargo): one face card each, safe from the ambushers (D-939)
  { const saved = medicine(state, o.lost.filter((x) => FACE.has(x.rank))); for (const x of saved) o.lost.splice(o.lost.indexOf(x), 1); }
  // Contingency Plan (Cunning King's Men Ász, personal deck): losing a road fight, 2 (Mastermind 3) random lost cards are kept
  { const val = (xs) => xs.reduce((a2, x) => a2 + cardValue(x), 0);
    const vP0 = val(c.cargo) - val(o.lost.map((x) => x.ref || x)) + val(o.won), vO0 = val(a.pool) - val(o.won.filter((x) => x.own === "opp").map((x) => x.ref || x)) + val(o.lost.map((x) => x.ref || x));
    const plan = two(c.personal.filter(KINGS.cunning)).reduce((a3, x) => a3 + (x.refined >= 2 ? 3 : 2), 0);   // copies add up, two at most (D-352, D-415)
    a.lostFight = !(vP0 > vO0 || (vP0 === vO0 && !a.playerAmbushes));
    if (plan && a.lostFight && o.lost.length) { const keep = []; for (let k = 0; k < plan && o.lost.length; k++) keep.push(o.lost.splice(Math.floor(state.rng.next() * o.lost.length), 1)[0]);
      note(state, `Contingency Plan: you hold on to ${keep.map(cardName).join(", ")}.`, "good"); } }
  const lost = new Set(o.lost.map((x) => x.ref));
  c.cargo = c.cargo.filter((x) => !lost.has(x));
  const won = o.won.map(plain); c.cargo.push(...won, ...m.generated);
  const wonFromPool = new Set(o.won.filter((x) => x.own === "opp").map((x) => x.ref));
  const genTaken = m.history.filter((t) => t.team === 1).flatMap((t) => t.stack.filter((x) => x.card.own === "gen").map((x) => x.card));
  const pool = [...a.pool.filter((x) => !wonFromPool.has(x)), ...o.lost.map((x) => x.ref), ...genTaken];   // D-221, D-227: captured generated cards count
  if (m.coins) c.coins += m.coins;
  const vP = c.cargo.reduce((s, x) => s + cardValue(x), 0), vO = pool.reduce((s, x) => s + cardValue(x), 0);
  const defenderIsPlayer = !a.playerAmbushes, youWin = vP > vO || (vP === vO && defenderIsPlayer);   // D-182, D-221: ties to the defender
  c.lastMatch = youWin ? "win" : "lose";
  note(state, `${a.kind} over. ${o.lost.length ? `Lost: ${o.lost.map(cardName).join(", ")}. ` : "You lost nothing. "}${won.length ? `Captured: ${won.map(cardName).join(", ")}. ` : ""}`
    + `Final cargo value ${vP} against their ${vO}: ${youWin ? "you win" : "they win"}${vP === vO ? " (tie to the defender)" : ""} (D-182).`, o.lost.length > won.length ? "bad" : "good");
  // a won road fight: Ransom (Aspiring Squire in cargo: coins each, PLACEHOLDER) and War Chest (Victorious Commander in the
  // personal deck: a King's Men Spoils each, guaranteed)
  if (youWin) {
    const ransom = Math.min(2, c.cargo.filter(KINGS.aspiring).length) * PLACEHOLDER.ransom;   // D-352
    if (ransom) { c.coins += ransom; note(state, `Ransom: your squires collect ${ransom} coins.`, "good"); }
    for (const _ of two(c.personal.filter(KINGS.victorious))) { c.cargo.push({ rank: "VIII", suit: "King's Men", name: "Spoils", roster: "main" }); note(state, "War Chest: King's Men Spoils from the victory.", "good"); }
  }
  state.match = null; state.ambush = null;
  // against a caravan: its losses and gains are real (D-222); a caravan below 8 cargo is out, and you may loot it (D-230, D-254)
  if (a.rival) {
    const rc = a.rival.caravan, took = new Set(o.won.filter((x) => x.own === "opp").map((x) => x.ref));
    rc.cargo = rc.cargo.filter((x) => !took.has(x)); rc.cargo.push(...o.lost.map((x) => plain(x.ref || x))); trimCargo(rc);
    rc.lastMatch = youWin ? "lose" : "win"; state.ambushRival = null; state.event = null;
    saddlebag(state, state.caravan, rc, (t) => note(state, t, "good"));
    saddlebag(state, rc, state.caravan, (t) => note(state, t, "bad"));
    // Infestation (Devouring Locust line, personal deck; no stacking): one unrefined VIII of the other side's exposed cargo, still
    // theirs after the match, becomes a basic Locust Swarm (D-500, D-501, D-655)
    const infest = (owner, victim, exposed, say) => { if (!owner.personal.some(AGRI.devouring)) return;
      const el = exposed.filter((x) => victim.cargo.includes(x) && x.rank === "VIII" && !x.refined); if (!el.length) return;
      const t = state.rng.pick(el), k = victim.cargo.indexOf(t); victim.cargo.splice(k, 1, { rank: "VII", suit: "Beasts", roster: "agricultural roster", name: "Locust Swarm" }); say(`Infestation: locusts get into ${cardName(t)}.`); };
    infest(state.caravan, rc, a.exposedOpp || [], (t) => note(state, t, "good"));
    infest(rc, state.caravan, a.picked || [], (t) => note(state, t, "bad"));
    return postMatch(state, won, () => { state.phase = "declare"; bankrupt(state, a.rival, "ambush"); });
  }
  postMatch(state, won, () => roadDone(state));            // captures are recruitable after ambushes (D-732)
}

// Saddlebag Raid (Notorious Outlaw line, personal deck): in an ambush or duel against another caravan, one random cargo card of the
// opposing caravan, whoever wins, after the normal transfers; it keeps its upgrades; space permitting (plainsfolk.md, D-357)
export function saddlebag(state, thief, victim, say) {
  if (!thief.personal.some(PLAINS.notorious) || !victim.cargo.length) return;
  if (slots(thief) >= thief.capacity) return say("Saddlebag Raid: no room in the wagon for anything more.");
  const t = victim.cargo.splice(Math.floor(state.rng.next() * victim.cargo.length), 1)[0]; thief.cargo.push(t);
  say(`Saddlebag Raid: ${cardName(t)} goes missing from a saddlebag.`);
}
// NPC bankruptcy (D-230, D-254): a caravan below 8 cargo after an encounter with you is out; its coins come to you, and you may take
// any of its remaining cargo that fits (the loot phase); the rest is abandoned
export function bankrupt(state, rival, how) {
  const rc = rival.caravan;
  if (rival.ended || counted(rc) >= RULES.cargoMinimum) return false;
  rival.ended = { won: false, reason: `Bankrupted by you (${how}): ${counted(rc)} cargo cards left.` }; rival.gone = true; rival.ai.result = rival.ended;
  state.caravan.coins += rc.coins;
  note(state, `${rival.ai.name[0].toUpperCase() + rival.ai.name.slice(1)} is finished: ${counted(rc)} cargo cards left. You take its ${rc.coins} coins and may pick through what's left (D-230).`, "good");
  rc.coins = 0; state.loot = { rival, cards: rc.cargo.slice() }; rc.cargo = []; state.phase = "loot";
  return true;
}
export function cardName(x) {
  const n = x.name || E.stageName(x);          // commodities (VIII, X) are named by their main-roster stage (commodity-tags.md)
  return n ? `${n} (${x.rank} ${x.suit})` : `${x.rank} ${x.suit}${x.refined ? " (refined)" : ""}`;
}

/** what a recruitment choice would do, for the interface */
export function recruitPreview(state, i, swap) {
  const c = state.caravan, card = state.recruit.eligible[i];
  const personal = swap == null ? [...c.personal, card] : c.personal.map((x, j) => (j === swap ? card : x));
  const cargoAfter = counted(c) - countedOut([card]) + (swap == null ? 0 : countedOut([c.personal[swap]]));
  const cap = capacity({ personal });
  return { cargoAfter, capacity: cap, capacityBefore: capacity(c), endsRun: cargoAfter < RULES.cargoMinimum };
}

// the card as cargo: its identity and upgrades, without the match's bookkeeping
// occupied wagon slots: cargo cards plus a Lost Traveller passenger (D-421: a slot, not a cargo card)
// a Golden Fleece bundle may exceed physical capacity: the only exception to the overflow rule (D-265)
export const slots = (c) => c.cargo.length - Math.floor(c.cargo.filter(FARMFOLK.packed).length / 2) + (c.passenger ? 1 : 0)   // Bulk Storage (D-388)
  - Math.floor(c.cargo.filter(HILL.iron).length / 2)                                                                            // Magnetism: Iron and Steel pair (D-388)
  - c.cargo.filter((x) => x.bundle && x.bundle.golden).length;
// Sticky Fleece bundles are sold or left as a whole (makk.md); each card keeps its own requirements otherwise (ABL-09)
const mates = (c, card) => (card.bundle ? c.cargo.filter((x) => x.bundle && x.bundle.id === card.bundle.id) : [card]);
const priceOf = (c, card, f) => mates(c, card).reduce((a, x) => a + f(x), 0);
function removeCargo(c, card) { const out = mates(c, card); c.cargo = c.cargo.filter((x) => !out.includes(x)); return out; }
// military strength: 1 per VII across cargo and the personal deck, rounded up (D-099, D-130, D-183, D-321)
// Holy Host (Militant Clergy Király in the personal deck): each non-Seven Clergy face card in cargo adds half a Seven (piros.md)
// military in a road encounter: Marching Formation (Marching Orders in the personal deck) adds its bonus (royal.md; amount PLACEHOLDER)
export const roadMilitary = (c) => military(c) + (c.personal.some(KINGS.orders) ? PLACEHOLDER.marchingFormation : 0)
  + Math.ceil([...c.cargo, ...c.personal].filter(FOREST.hardy).length * PLACEHOLDER.roadDefence);   // Road Defence (Hardy Forager line): road encounters, not checkpoints (amount PLACEHOLDER)
// Imposing Tradesfolk VII (Armed Escort / Hired Bodyguard / Elite Guard): 1.5 Sevens; Ruthless Tradesfolk Király in the
// personal deck (Hired Swords): +2 Sevens (tok.md)
export const military = (c) => Math.ceil([...c.cargo, ...c.personal].reduce((a, x) => a + (x.rank !== "VII" ? 0 : TRADES.imposing(x) ? 1.5 : 1), 0)
  // Armour Supply (Thick Forestfolk VIII line, cargo): each adds military; Pack Leader (Commanding Horn, personal deck): every Beasts card
  // in cargo adds military; both amounts PLACEHOLDER (zold.md: TBD)
  + c.cargo.filter(FOREST.thick).length * PLACEHOLDER.armourSupply
  + (c.personal.some(FOREST.commanding) ? c.cargo.filter((x) => x.suit === "Beasts").length * PLACEHOLDER.packLeader : 0)
  + (c.personal.some(CLERGY.militant) ? 0.5 * c.cargo.filter(CLERGY.face).length : 0)
  + (c.personal.some(TRADES.ruthless) ? 2 : 0)
  + [...c.cargo, ...c.personal].filter(CARNIVAL.lumbering).length   // Bear Guard: one Seven's military each, either deck
  // Armed Cargo (Battle-Worn Surplus Arms): 1 military in total however many (D-631); Cloak and Dagger (Sinister Concealed
  // Dagger line): each counts as a Seven (D-641)
  + ([...c.cargo, ...c.personal].some((x) => ALT.weapons(x) && x.adjective === "Battle-Worn" && x.refined >= 2) ? 1 : 0)
  + [...c.cargo, ...c.personal].filter((x) => ALT.dagger(x) && x.adjective === "Sinister").length
  // Military Escort (Strict King's Men Alsó in the personal deck): each Conscript in cargo counts as an Infantryman
  + (c.personal.some(KINGS.strict) ? c.cargo.filter(conscript).length : 0)
  // Pack Hunting: with a Pack Wolf in cargo, every two Beasts Alsó in cargo are one Seven (not stacking)
  + (c.cargo.some(BEASTS.pack) ? Math.floor(c.cargo.filter((x) => x.suit === "Beasts" && x.rank === "Alsó").length / 2) : 0));
// Special Treatment (Enticing Tradesfolk Ász in the personal deck): tolls, crossings and upgrade costs 5 / 10 / 15 % cheaper
// by stage (the best one counts); rounded up so a fee never drops below 1 by rounding (D-278)
export const specialTreatment = (c) => Math.max(0, ...c.personal.filter(TRADES.enticing).map((x) => [0.05, 0.1, 0.15][x.refined || 0]));
const discounted = (c, price, extra = 0) => price <= 0 ? price : Math.max(1, Math.ceil(price * (1 - Math.min(RULES.modifierCap, specialTreatment(c) + extra + (c.personal.some(ALT.lard) ? 0.05 : 0) + funny(c)))));   // + The Power of Zsír: services -5 %; Funny Money

// D-662: a captured upgraded card arrives as an exact copy or as its base version; chance TBD (PLACEHOLDER). Region 1
// encounter decks are unupgraded (D-450, D-406), so the roll changes nothing yet
function qualityRoll(state, x) {
  if (!x.refined && !x.adjective && !x.attrition) return x;
  // the hideout's capture-quality upgrade raises the exact-copy chance (D-418, D-662; size PLACEHOLDER)
  if (state.rng.next() < luck(state, PLACEHOLDER.exactCopyChance + (state.captureBonus || 0))) return x;
  const { refined, adjective, name, attrition, ...base } = x; note(state, `Capture quality: ${cardName(x)} arrives as its base card (D-662).`, "warn"); return base;
}

// a match card back to an ordinary card; a generated copy of a mercenary's deck card (Cheap Imitation, Pillage's loot, a copying
// refinement) is an ordinary card once captured, so the transient mark goes too (D-157)
function plain(x) { const { id, origin, ownerSeat, ref, own, mercDeck, ...rest } = x; return rest; }

// D-265 overflow, then whatever comes next
function afterIncoming(state, next, fromMatch = false) {
  const c = state.caravan; c.capacity = capacity(c);
  if (slots(c) > c.capacity) {
    state.phase = "overflow"; state.afterOverflow = fromMatch ? () => { scavenging(state); next(); } : next;
    note(state, `The wagon is over capacity (${c.cargo.length} of ${c.capacity}): choose what to leave behind (D-265).`, "warn"); return;
  }
  next();
}

// Scavenging (Scavenging Jackal / Toportyán, personal deck): after a match that overfilled the wagon, once the discards are done,
// each one rolls: Jackal 50 % nothing / 49 % an unrefined VIII / 1 % an unrefined X refines; Toportyán 40 / 55 / 5 (D-492 to D-494)
function scavenging(state) {
  const c = state.caravan;
  for (const x of c.personal.filter(AGRI.scavenging)) {
    // Good Fortune, Lard and Crooked raise the best outcome (the X), taken from "nothing", as Untrained's double (D-614, D-905)
    const bonus = luck(state, 0) + temper(state), base = x.refined >= 1 ? [0.4, 0.95] : [0.5, 0.99];
    const d = state.rng.next(), top = [Math.max(0, base[0] - bonus), Math.max(0, base[1] - bonus)];
    const rank = d < top[0] ? null : d < top[1] ? "VIII" : "X";
    const el = rank ? c.cargo.filter((y) => y.rank === rank && !y.refined && COMMODITY_NEXT(y)) : [];
    if (el.length) { const t = state.rng.pick(el), before = cardName(t); applyUpgrade(t, "refine"); afterRefine(state, t); growl(state, `Scavenging: the jackal picks over the leavings; ${before} becomes ${cardName(t)}.`); }
  }
}
// Bundling (Entangling Willow line): this card's own chance to sell for double, after the percentages: 2 / 4 / 6 % by stage; a beneficial
// roll (D-590, D-592, D-378)
function bundling(state, card, price) {
  if (!(FOREST.willow(card) && card.adjective === "Entangling") || state.rng.next() >= luck(state, [0.02, 0.04, 0.06][card.refined || 0])) return 0;
  note(state, `Bundling: the willow drags a second lot along: ${price} coins more.`, "good"); return price;
}
// False Advertising (mercenary #2, from Charlatan): an eligible VIII sold has 25 % to fetch the price of the same suit's X in the same
// state; a random X line where the suit has several; you're told what it sold as (D-340, D-487); a beneficial roll (D-378)
function falseAdvertising(state, m, card, price) {
  if (card.rank !== "VIII" || !state.caravan.personal.some(MERC.charlatan) || state.rng.next() >= luck(state, 0.25)) return 0;
  const xs = E.stagesOf((x) => x.suit === card.suit && x.rank === "X" && x.stage === (card.refined || 0) && x.roster !== "secret alternative"); if (!xs.length) return 0;
  const as = { ...E.cardFromStage(state.rng.pick(xs)), ...(card.adjective ? { adjective: card.adjective } : {}) }, extra = Math.max(0, sellPrice(m, as) - price);
  note(state, `False Advertising: the Charlatan sells it as ${cardName(as)}: ${extra} coins more.`, "good"); return extra;
}
function discard(state, i, sold = false) {
  const c = state.caravan, [x] = removeCargo(c, c.cargo[i]);
  if (!sold) note(state, `Left behind ${cardName(x)}.`);
  if (slots(c) <= c.capacity) { const next = state.afterOverflow; state.afterOverflow = null; next(); }
}

// a market commodity: a base VIII of a suit present, its version chosen at random among the suit's cards (D-487)
function commodity(rng, m) {
  // the market's version of the commodity follows the settlement's roster for that suit (D-530, D-554; D-487 within it)
  const suit = rng.pick(m.suits), roster = (m.roster ||= E.rosterChooser(rng, m.tier, m.beastsRoster))(suit);
  const v = E.stagesOf((s) => s.suit === suit && s.rank === RULES.marketCommodityRank && s.stage === 0 && (roster === "main" ? s.roster === "main" || s.roster === "alternative" : s.roster === roster));
  return v.length ? E.cardFromStage(rng.pick(v)) : { rank: RULES.marketCommodityRank, suit };
}

// ---- the Fence (D-112, D-812, D-663; settlements.md "Fence (blind bins)"; sizes, prices and odds PLACEHOLDER, SET-07)
const ILLICIT = E.stagesOf((x) => (x.tags || []).includes("illicit"));
// is this card an illicit stage? (D-812 (2)): by its line and stage
export function illicit(card) {
  if ((card.tags || []).includes("illicit")) return true;
  return ILLICIT.some((x) => x.suit === card.suit && x.rank === card.rank && x.roster === (card.roster || "main") && x.stage === (card.refined || 0)
    && (card.name ? card.name === x.name || card.name.endsWith(" " + x.name) : x.roster === "main"));
}
// the fence's counter: an illicit good at a random stage, or now and then a basic Rank X (markets never sell X, D-663)
function fenceGood(rng) {
  if (rng.next() < PLACEHOLDER.fence.xChance) return E.cardFromStage(rng.pick(E.stagesOf((x) => x.rank === "X" && x.stage === 0 && x.roster !== "secret alternative")));
  return E.cardFromStage(rng.pick(ILLICIT));
}
// a blind bin: cards of any suit, unknown until bought; a limited chance of valuable (X, Ász) and of upgraded cards
function blindBin(rng) {
  const F = PLACEHOLDER.fence, out = [];
  for (let k = 0; k < F.binSize; k++) {
    const rank = rng.next() < F.valuableChance ? rng.pick(["X", "Ász"]) : rng.pick(["VII", "VIII", "IX", "Alsó", "Felső", "Király"]), suit = rng.pick(SUITS12_E);
    const v = E.isCommodity({ rank }) ? E.stagesOf((x) => x.suit === suit && x.rank === rank && x.stage === 0 && x.roster !== "secret alternative") : [];
    const card = v.length ? E.cardFromStage(rng.pick(v)) : { rank, suit };
    if (rng.next() < F.upgradedChance && upgradeEntry(card)) applyUpgrade(card, "refine");
    out.push(card);
  }
  return out;
}
const SUITS12_E = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Beasts", "Bandits", "Townsfolk", "King's Men", "Hillfolk", "Carnivalfolk", "Fisherfolk", "Plainsfolk"];
function fence(state, opts, action) {
  const c = state.caravan, f = state.fences[c.at], a = opts.actions.find((x) => x.type === action.type && (x.i === action.i || action.type === "fence-bin"));
  if (!f || !a || a.allowed === false) throw new Error("illegal fence action");
  if (action.type === "fence-bin") {
    c.coins -= a.price; const got = blindBin(state.rng);
    note(state, `Fence: a blind bin for ${a.price} coins holds ${got.map(cardName).join(", ")}.`, "good");
    c.cargo.push(...got);
    return afterIncoming(state, () => { state.phase = "location"; if (lostRun(state)) return; });   // too much? the overflow step (D-265)
  }
  if (action.type === "fence-buy") { c.coins -= a.price; c.cargo.push(f.stock.splice(action.i, 1)[0]); note(state, `Fence: bought ${cardName(a.card)} for ${a.price} coins, no questions asked.`); return; }
  removeCargo(c, c.cargo[action.i]); c.coins += a.price; note(state, `Fence: sold ${cardName(a.card)} for ${a.price} coins${action.type === "fence-smuggle" ? `, smuggled in from Region ${a.from}` : ""}.`, action.type === "fence-smuggle" ? "good" : "info"); lostRun(state);
}

// ---- the Tavern's food and drink (D-816 (3)): refined food and drink stages, the local suits' first, at the inn's slight markup
// (read from the inn, D-807, D-811); and its rumours (D-435): about the places you haven't found, true or false, the true ones
// more often; no truth labels, you judge by corroboration (truth chance PLACEHOLDER)
function tavernFood(rng, tv) {
  const refined = (pred) => E.stagesOf((x) => x.stage >= 1 && ((x.tags || []).includes("food") || (x.tags || []).includes("drink")) && x.roster !== "secret alternative" && pred(x));
  const local = refined((x) => tv.suits.includes(x.suit)), opts = local.length ? local : refined(() => true);
  return E.cardFromStage(rng.pick(opts));
}
function tavernRumour(state, here) {
  const c = state.caravan, key = `${here.id}:${state.round}`; if ((state.heardAt ||= new Set()).has(key)) return; state.heardAt.add(key);
  const hidden = state.board.stops.filter((x) => x.kind === "poi" && !state.discovered.has(x.id) && !state.visited.has(x.id));
  if (!hidden.length) return note(state, "Tavern talk: nothing you haven't heard.");
  const r = state.rng, poi = r.pick(hidden), kinds = [...new Set(state.board.stops.filter((x) => x.kind === "poi").map((x) => x.poi))];
  const said = r.next() < PLACEHOLDER.rumourTrue || kinds.length < 2 ? poi.poi : r.pick(kinds.filter((k) => k !== poi.poi));
  ((state.rumours ||= {})[poi.id] ||= []).push(said);
  note(state, `Tavern talk: they say the place off the road at stop ${poi.stop} is ${/^[aeiou]/i.test(said) ? "an" : "a"} ${said}.`);
}
// ---- the Avaricious Profiteer's shops (mercenary #4, from Hawker; mercenaries.md; markups, stock and refresh PLACEHOLDER, deferred):
// the travelling shop sells (never buys) a random commodity above market price wherever there's a shop or a roadside encounter; the
// checkpoint shop offers three random cards of different kinds, dearer still but below the Checkpoint Trader; new stock each visit
function profiteerShop(state, where) {
  const c = state.caravan; if (!c.personal.some(MERC.hawker)) return [];
  const key = `${where}:${c.at}:${state.round}`, P = PLACEHOLDER.merc;
  state.mercShop ||= {};
  if (!state.mercShop[key]) {
    const r = state.rng, any = () => E.cardFromStage(r.pick(E.stagesOf((x) => x.stage === 0 && x.roster !== "secret alternative")));
    if (where === "checkpoint") { const out = [], ranks = new Set(); for (let k = 0; k < 40 && out.length < 3; k++) { const rk = r.pick(["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"]); if (ranks.has(rk)) continue; ranks.add(rk);
        const v = E.isCommodity({ rank: rk }) ? E.stagesOf((x) => x.rank === rk && x.stage === 0 && x.roster !== "secret alternative") : []; out.push(v.length ? E.cardFromStage(r.pick(v)) : { rank: rk, suit: r.pick(SUITS12_E) }); }
      state.mercShop[key] = { stock: out, mult: P.checkpointShopMarkup }; }
    else state.mercShop[key] = { stock: [any()], mult: P.shopMarkup };
  }
  const sh = state.mercShop[key];
  return sh.stock.map((card, i) => { const price = Math.ceil(cardValue(card) * sh.mult); return { type: "merc-shop", i, card, price, where: key, allowed: c.coins >= price && slots(c) < c.capacity }; });
}
function buyFromProfiteer(state, opts, action) {
  const a = opts.actions.find((x) => x.type === "merc-shop" && x.i === action.i); if (!a || !a.allowed) throw new Error("not available");
  const c = state.caravan; c.coins -= a.price; c.cargo.push(state.mercShop[a.where].stock.splice(a.i, 1)[0]);
  note(state, `The Profiteer's shop: ${cardName(a.card)} for ${a.price} coins (he knows you need it).`);
}
// ---- investments (D-659, D-660, D-746 to D-748, D-824 (2), D-825 (2)); one investment per caravan (D-659 leaves several open)
function bank(state, opts, action) {
  const c = state.caravan, a = opts.actions.find((x) => x.type === action.type); if (!a || !a.allowed) throw new Error("not available here");
  const inv = (c.investment ||= { principal: 0, uncollected: 0 });
  const n = Math.floor(+action.amount || 0);
  if (action.type === "invest") { if (n < 1 || n > c.coins) throw new Error("invest 1 to " + c.coins); c.coins -= n; inv.principal += n; note(state, `Banking House: ${n} coins invested in the Guild's ventures (principal now ${inv.principal}).`, "good"); return; }
  if (action.type === "withdraw") { if (n < 1 || n > inv.principal) throw new Error("withdraw 1 to " + inv.principal); inv.principal -= n; c.coins += n; note(state, `Banking House: ${n} coins of principal withdrawn (${inv.principal} still invested).`); return; }
  if (action.type === "close-investment") { const p = inv.principal; inv.principal = 0; c.coins += p; note(state, `Banking House: investment closed, ${p} coins returned${inv.uncollected > 0 ? "; uncollected dividends can still be collected at a Guild" : ""}.`); return; }
  const got = Math.ceil(inv.uncollected); inv.uncollected = 0; c.coins += got; note(state, `Guild: ${got} coins of dividends collected.`, "good");   // fractions round up (D-278)
}
/** money earned at the end of a run counts invested principal and uncollected dividends (D-660, D-748) */
export function investedWealth(c) { const inv = c.investment || { principal: 0, uncollected: 0 }; return { principal: inv.principal, uncollected: Math.ceil(inv.uncollected) }; }

// every round each Market restocks a little (D-110, D-859 (9); amount PLACEHOLDER)
function endRound(state) {
  state.round += 1;
  // investment dividends accrue every round the principal is invested (D-659: "qualifying rounds since the last collection"); simple,
  // on principal only; rate PLACEHOLDER (D-672: Banking House rates held); unspendable until collected at a Guild (D-747, D-825)
  const inv = state.caravan.investment;
  if (inv && inv.principal > 0) inv.uncollected += inv.principal * PLACEHOLDER.dividendPerRound;
  if (state.sharedMarkets) return;                       // an AI caravan's view of the shared markets: the world refreshes them once
  for (const f of Object.values(state.fences || {})) if (f.stock.length < PLACEHOLDER.fence.stock) f.stock.push(fenceGood(state.rng));
  for (const tv of Object.values(state.taverns || {})) if (tv.food.length < PLACEHOLDER.enc.innStock) tv.food.push(tavernFood(state.rng, tv));
  for (const m of Object.values(state.markets))
    for (let i = 0; i < PLACEHOLDER.refreshPerRound && m.stock.length < m.size; i++) m.stock.push(commodity(state.rng, m));
}

// ---------------------------------------------------------------- Market (D-675, D-146, D-592; values PLACEHOLDER)
// an ambush victory weighs Merchant's Cut (D-274), rounded up once (D-278, D-280)
export const cutValue = (card) => Math.ceil(cardValue(card) * (1 + (card.cutPct || 0) / 100));
// Card value (D-539; your ruling 2026-11-05, D-942): the rank's base value plus the value to the player of every upgrade the card
// carries, which is what the valuation investigation measured and priced (the draft prices, D-671): each refinement step taken and
// the adjective (its price at the card's current stage), at their Region 1 prices (the price rise by region, D-940, is a price, not value). A card with no catalogue entry
// keeps its base value
export function cardValue(card) {
  let v = PLACEHOLDER.cardValue[card.rank] ?? 1;
  const e = (card.refined || card.adjective) && upgradeEntry(card);
  if (e) {
    for (let k = 0; k < (card.refined || 0) && k < e.refine.prices.length; k++) v += e.refine.prices[k];
    if (card.adjective && e.adj) { const p = e.adj.price; v += Array.isArray(p) ? p[Math.min(card.refined || 0, p.length - 1)] : p; }
  }
  return v + (card.quality || 0) * PLACEHOLDER.qualityTier;   // Quality Improvement tiers (D-387; tier value PLACEHOLDER, V8-01)
}
// combined percentage modifiers, capped at 60 % either way (D-592): market demand, Trading Advantage (a refined Tradesfolk IX
// in the personal deck: 15 %, tok.md) and, on selling, Merchant's Cut attached to the card (D-274, D-280)
let trader = null;                                        // the caravan whose personal deck counts (set by options/act)
function demandFactor(m, suit, extra = 0) {
  const pct = (suit === m.demand.up ? PLACEHOLDER.demandUp : suit === m.demand.down ? -PLACEHOLDER.demandDown : 0) + extra;
  return 1 + Math.max(-RULES.modifierCap, Math.min(RULES.modifierCap, pct));
}
const advantage = () => (trader && trader.personal.some(TRADES.papers) ? 0.15 : 0);
// The Power of Zsír (Almighty Lard in the personal deck): commodity purchases 5 % cheaper (D-596), within the 60 % cap
const lardOn = () => trader && trader.personal.some(ALT.lard);
// Funny Money (Spurious Clipped Coins line, personal deck): purchases and services 4 / 8 / 12 % by stage, two copies at most (D-636, D-352)
const funny = (c) => two(c.personal.filter((x) => ALT.coins(x) && x.adjective === "Spurious").sort((a, b) => (b.refined || 0) - (a.refined || 0))).reduce((a, x) => a + [0.04, 0.08, 0.12][x.refined || 0], 0);
// the trade multipliers by the card's suit at this place (your ruling, 2026-11-05): buying 0.75x where its suit lives, 1.25x
// (rounded up) where it doesn't; selling 0.5x where it lives, 1x where it doesn't
export const suitHere = (suits, card) => (suits || []).includes(card.suit);
export const buyMult = (suits, card) => (suitHere(suits, card) ? RULES.buyPresent : RULES.buyAbsent);
export const sellMult = (suits, card) => (suitHere(suits, card) ? RULES.sellPresent : RULES.sellAbsent);
const buyRound = (suits, card) => (suitHere(suits, card) ? Math.round : Math.ceil);
export function buyPrice(m, card) { return INFL === 1 ? buyPriceBase(m, card) : Math.max(1, Math.ceil(buyPriceBase(m, card) * INFL)); }
function buyPriceBase(m, card) { return Math.max(1, buyRound(m.suits, card)(cardValue(card) * buyMult(m.suits, card) * demandFactor(m, card.suit, -advantage() - (lardOn() ? 0.05 : 0) - (trader ? funny(trader) : 0) - wanderBuy(card) - peddlerDiscount(card) - privileges(card) - temptingBuy(m, card) - metalPct(HILL.gold, card)))); }
// Tempting Trade on goods: commodities 2 / 5 % cheaper where no Forestfolk live (D-591, D-593)
const temptingBuy = (m, card) => (trader && (card.rank === "VIII" || card.rank === "X") && !(m.suits || []).includes("Forestfolk")
  ? Math.max(0, ...trader.personal.filter((x) => FOREST.beaver(x) && x.refined >= 1).map((x) => (x.refined >= 2 ? 0.05 : 0.02))) : 0);
// Market Privileges (Leave Permit, personal deck): basic, unrefined VIII goods 10 % cheaper, within the 60 % cap (D-622, D-592)
const privileges = (card) => (trader && trader.personal.some(RURAL_T.permit) && card.rank === "VIII" && !card.refined ? 0.1 : 0);
// Luxury Trade (Haughty rural Mercer, personal deck; two at most): fully refined VIII / X sell +30 % (D-538); Wandering's Covered
// Wagon: commodities sell +10 %, Kocsi: buy -10 % (two at most, D-551, D-352)
const luxury = (card) => (trader && (card.rank === "VIII" || card.rank === "X") && (card.refined || 0) >= 2 ? 0.3 * Math.min(2, trader.personal.filter(RURAL.haughty).length) : 0);
const wanderSell = (card) => (trader && (card.rank === "VIII" || card.rank === "X") ? 0.1 * Math.min(2, trader.personal.filter((x) => RURAL.wandering(x) && x.refined >= 1).length) : 0);
const wanderBuy = (card) => (trader && (card.rank === "VIII" || card.rank === "X") ? 0.1 * Math.min(2, trader.personal.filter((x) => RURAL.wandering(x) && x.refined >= 2).length) : 0);
// Discount (rural Travelling Merchant; personal deck, reading): 20 % off base-stage VIII and X goods, not Tradesfolk, bought from
// markets and peddlers (D-535)
const peddlerDiscount = (card) => (trader && trader.personal.some(RURAL.merchant) && (card.rank === "VIII" || card.rank === "X") && !card.refined && card.suit !== "Tradesfolk" ? 0.2 : 0);
// Savoury Pork / Kolbász in the personal deck: Plainsfolk commodities sell +2 % / +4 %, not stacking (D-595)
const pigBonus = (card) => card.suit === "Plainsfolk" && (card.rank === "VIII" || card.rank === "X") && trader
  ? Math.max(0, ...trader.personal.filter((x) => ALT.pig(x) && x.adjective === "Savoury" && (x.refined || 0) >= 1).map((x) => (x.refined >= 2 ? 0.04 : 0.02))) : 0;
// Premium Produce (Decadent Sweet Grapes, base stage): +40 % of its base value sold in a Tier II or III settlement (D-563);
// Hallowed (any Reliquary with the adjective): 200 % of its value sold in a Tier IV city with Clergy among its suits (D-575)
const decadent = (card) => ALT.sweet(card) && card.adjective === "Decadent";
export function sellPrice(m, card) { return INFL === 1 ? sellPriceBase(m, card) : Math.max(1, Math.round(sellPriceBase(m, card) * INFL)); }
function sellPriceBase(m, card) {
  if (ALT.reliquary(card) && card.adjective === "Hallowed" && m.tier === "city" && m.suits.includes("Clergy")) return Math.ceil(cardValue(card) * 2);
  // Absolutely Essential (Essential rural Ironware line, cargo): sold in a Tier I or II settlement, twice its card value (D-544)
  if (RURAL.essential(card) && (m.tier === "village" || m.tier === "market town")) return Math.ceil(cardValue(card) * 2);
  if (RURAL_T.hearty(card) && card.refined >= 2) return Math.ceil(plainSell(m, card) * 2);   // Premium Sale: Bread 200 %, everywhere, after the percentages (D-618, D-592)
  if (ALT.weapons(card) && card.adjective === "Battle-Worn" && card.refined === 1 && m.tier === "village") return Math.ceil(plainSell(m, card) * 1.5);   // Country Buyers (D-631)
  return plainSell(m, card) + (decadent(card) && !card.refined && (m.tier === "market town" || m.tier === "town") ? Math.ceil(cardValue(card) * 0.4) : 0);
}
// Local Sale Price Bonus (Down, Feather Bedding): by settlement tier, Down +3 / 8 / 13 / 18 %, Feather Bedding +5 / 10 / 15 / 20 %, of
// that card's price, rounded up (D-503, D-656)
const TIER_INDEX = { village: 0, "market town": 1, town: 2, city: 3 };
const featherBonus = (m, card) => (AGRI.down(card) ? [[0.03, 0.08, 0.13, 0.18], [0.05, 0.1, 0.15, 0.2]][card.refined >= 2 ? 1 : 0][TIER_INDEX[m.tier] ?? 0] : 0);
// Trade Privileges (Smith's Papers, personal deck): Hillfolk VIII +10 % where Hillfolk don't live; Seller's Market (Circulating Silver,
// personal deck; the best one): VIII and X +2 / 6 / 10 %; Buyer's Market (Hoarded Gold) buying -2 / 6 / 10 % (D-587, D-588)
const smithBonus = (m, card) => (trader && card.suit === "Hillfolk" && card.rank === "VIII" && !(m.suits || []).includes("Hillfolk") && trader.personal.some(HILL.smiths) ? 0.1 : 0);
const metalPct = (pred, card) => (trader && (card.rank === "VIII" || card.rank === "X") ? Math.max(0, ...trader.personal.filter((x) => pred(x) && x.adjective).map((x) => [0.02, 0.06, 0.1][x.refined || 0])) : 0);
// Reed Trade (Reed Thatcher, personal deck): Fisherfolk VIII and X sell +20 %, stacking twice
const reedTrade = (card) => (trader && card.suit === "Fisherfolk" && (card.rank === "VIII" || card.rank === "X") ? 0.2 * Math.min(2, trader.personal.filter(FISH.thatcher).length) : 0);
function plainSell(m, card) { const fb = featherBonus(m, card) + smithBonus(m, card) + metalPct(HILL.silver, card) + reedTrade(card); return Math.max(1, (card.cutPct || pigBonus(card) || luxury(card) || wanderSell(card) || fb ? Math.ceil : Math.round)(cardValue(card) * sellMult(m.suits, card) * demandFactor(m, card.suit, advantage() + pigBonus(card) + luxury(card) + wanderSell(card) + fb + (card.cutPct || 0) / 100))); }

// ---------------------------------------------------------------- checkpoint (D-107, D-109, D-713, D-719)
export function requirementStatus(state) {
  const c = state.caravan;
  if (state.mode === "playtest") {                       // isolated override; the canonical rule below is untouched
    const suits = new Set(c.cargo.filter((x) => x.rank === PLAYTEST.rank && x.suit !== PLAYTEST.excludeSuit).map((x) => x.suit));
    return { rank: PLAYTEST.rank, count: PLAYTEST.count, have: suits.size, met: suits.size >= PLAYTEST.count, playtest: true, label: PLAYTEST.label, suits: [...suits] };
  }
  const r = state.requirement;
  const all = [...c.cargo, ...c.personal];
  // checkpoint sabotage (Assassination Tools, D-657, D-940): the guards ask for one card fewer, minimum 1; with two lines (Exports),
  // the first line that asks for more than one gives it up
  const sab = state.sabotage ? 1 : 0, cut = r.parts ? r.parts.findIndex((p) => p.count > 1) : -1;
  // a toll (D-947): coins in hand against the amount; sabotage takes one step (10) off; Expedited Inspection doesn't apply
  if (r.kind === "toll") { const amount = Math.max(10, r.count - (sab ? 10 : 0));
    return { id: r.id, kind: "toll", title: r.title, ask: `a toll of ${amount} coins` + (sab ? " (cut: sabotage)" : ""), short: r.short, count: amount, test: r.test, have: Math.min(c.coins, amount), met: c.coins >= amount, expedited: false, sabotage: !!sab }; }
  const parts = r.parts && r.parts.map((p, i) => (sab && i === cut ? { ...p, count: p.count - 1 } : p));
  const count = Math.max(1, r.count - (sab && (!r.parts || cut >= 0) ? 1 : 0));
  // a scenario of several parts (Exports: two lines, D-935) counts each part up to its own number
  const have = (parts ? parts.reduce((a, p) => a + Math.min(p.count, all.filter(p.test).length), 0) : all.filter(r.test).length) + (state.reqBribed || 0);
  // Expedited Inspection (Fisherman's Papers, personal deck) "may" bypass requirements demanding specific cargo: a 25 % chance at
  // submission (your ruling, D-946; amends D-742 (2)), rolled in submit(); it isn't counted as met beforehand. Every current scenario
  // asks for cards, so all count (D-946); a future non-cargo scenario (a toll, settlements visited) wouldn't
  const expedited = c.personal.some(FISH.papers);
  return { id: r.id, title: r.title, ask: r.ask + (sab ? " (one fewer: sabotage)" : ""), short: r.short, count, test: r.test, have, met: have >= count, expedited: expedited && have < count, sabotage: !!sab };
}

// the emergency return's cost is its two highway tolls (D-118, D-323); toll abilities apply by their own text
export function emergencyCost(state) { return highwayToll(state).amount * 2; }

function emergencyTarget(state) {
  // the one settlement on the highway before the checkpoint (D-719)
  for (const leg of state.board.legs)
    if (leg.to === state.board.checkpoint && state.stops[leg.from].kind === "settlement" && leg.segments.every((s) => s.cls === "highway")) return leg.from;
  return null;
}

// one highway toll as a fee (waived by Highway Fee Exemption; Special Treatment applies)
// Highway Robbery (Highwayman in the personal deck): no toll, and the caravan collects the normal toll instead (+5); not on
// a toll that Highway Fee Exemption already waives (reading of D-499); copies don't stack
function highwayToll(state) {
  if (highwayExempt(state.caravan)) return { kind: "toll", amount: 0, label: "highway toll (waived: Highway Fee Exemption)", waived: true };
  // Tax Evasion (Ebborz, personal deck): no ordinary tolls, and so no Highway Robbery payout either (D-498, D-499)
  if (state.caravan.personal.some(AGRI.ebborz)) return { kind: "toll", amount: 0, label: "highway toll (waived: Tax Evasion)", waived: true };
  if (state.caravan.personal.some(BANDITS.highwayman)) return { kind: "toll", amount: 0, label: "highway toll (Highway Robbery: you collect it)", waived: true, robbery: RULES.highwayToll };
  return { kind: "toll", amount: discounted(state.caravan, RULES.highwayToll), label: "highway toll" };
}
// both tolls (5 + 5, D-118) are paid now, in coins only (D-323, D-871 (1)); the settlement is a full visit (D-109: "a settlement
// visit"): arrival abilities and the chance of a match as usual
function emergency(state) {
  const c = state.caravan, target = emergencyTarget(state), f = highwayToll(state), cost = emergencyCost(state);
  c.usedEmergency = true;
  if (f.robbery) { c.coins += 2 * f.robbery; note(state, `Highway Robbery: you collect ${2 * f.robbery} coins from the toll-booths instead of paying.`, "good"); }
  else if (f.waived) note(state, `No highway tolls: ${f.label.replace(/^.*\((?:waived: )?(.*)\)$/, "$1")}.`, "good");
  else { c.coins -= cost; note(state, `Paid ${cost} coins: the two highway tolls of the emergency return.`); }
  c.emergency = { deadline: state.round + RULES.emergencyReturnRounds - 1, castle: !!state.final };
  state.final = false;                                           // the Royal Castle allows it too (your ruling, 2026-11-05)
  c.at = target; c.onHighway = true; state.visited.add(target);
  note(state, `Emergency return to ${describe(state.stops[target])}. Return to ${c.emergency.castle ? "the Royal Castle" : "the checkpoint"} next round.`, "warn");
  if (lostRun(state)) return;
  state.phase = "location"; arrive(state);                       // arrive() ends the round
}

// ---------------------------------------------------------------- suspicion (D-128 to D-132, D-165; suspicion.md §3)
export function suspicion(state) {
  const c = state.caravan, all = [...c.cargo, ...c.personal];
  // Smuggling Expert (Chapman's Papers, personal deck): X and Ász generate 50 % of their normal suspicion (D-546; D-507, D-510)
  const smug = c.personal.some(RURAL.chapman) ? 0.5 : 1;
  const contraband = all.reduce((a, x) => a + (((x.rank === "X" || x.rank === "Ász") ? 1 : 0) + (x.suit === "Bandits" ? 1 : 0)) * ((x.rank === "X" || x.rank === "Ász") ? smug : 1), 0);
  // 1 per VII (R-34); Imposing 1.5; Concealed Threat (Unflinching Carnivalfolk VII) half; Bear Guard counts as a Seven (D-357)
  const escort = c.personal.some(KINGS.strict);
  // Concealed Arms (Forester's Papers, personal deck): rank VII cargo generates 50 % less suspicion; military strength unchanged (zold.md)
  const arms = c.personal.some(FOREST.papers) ? 0.5 : 1;
  let military = all.filter((x) => !MERC.liderc(x)).reduce((a, x) => a + (x.rank !== "VII" ? (CARNIVAL.lumbering(x) || (escort && conscript(x) && c.cargo.includes(x)) ? 1 : 0) : (TRADES.imposing(x) ? 1.5 : CARNIVAL.unflinching(x) ? 0.5 : 1) * (c.cargo.includes(x) ? arms : 1)), 0);
  // Official Business: more than half the personal deck King's Men: checkpoints ignore military for suspicion (needs Marching Orders)
  const official = c.personal.some(KINGS.orders) && c.personal.filter((x) => x.suit === "King's Men").length * 2 > c.personal.length;
  if (all.some((x) => ALT.weapons(x) && x.adjective === "Battle-Worn" && x.refined >= 2)) military += 1;   // Armed Cargo, capped at 1
  military += all.filter((x) => ALT.dagger(x) && x.adjective === "Sinister" && !x.refined).length;          // Cloak and Dagger: 1 / 0 / 0
  if (c.cargo.some(BEASTS.pack)) military += Math.floor(c.cargo.filter((x) => x.suit === "Beasts" && x.rank === "Alsó").length / 2);   // Pack Hunting (D-128, D-130)
  if (official) military = 0;
  // Farmer's Papers: suspicion-free up to 40; Structural Improvements (Ingenious Townsfolk Ász, personal deck): threshold 40,
  // no extra slots (D-556); threshold effects don't stack
  const threshold = Math.max(capacity(c), c.personal.some(TOWNS.ingenious) ? 40 : 0);
  const parts = {
    contraband,
    military: Math.ceil(Math.max(0, military - 5)),
    cargo: 2 * Math.ceil(Math.max(0, (c.cargo.length - Math.floor(c.cargo.filter(FARMFOLK.packed).length / 2) - Math.floor(c.cargo.filter(HILL.iron).length / 2)) - threshold) / 4),   // rate provisional (D-131)
    personal: Math.max(0, c.personal.length - 14),
    // Sticky Fleece: a Silken-Fleeced bundle carries extra suspicion; a Golden-Fleeced bundle none (D-651); amount PLACEHOLDER (SUS-05)
    bundle: new Set(c.cargo.filter((x) => x.bundle && !x.bundle.golden).map((x) => x.bundle.id)).size * PLACEHOLDER.stickyBundleSuspicion,
    // the Oracle's intrinsically high suspicion (Clergy Ász at Oracle, D-653: kept, value TBD -> PLACEHOLDER)
    oracle: all.filter((x) => x.suit === "Clergy" && x.rank === "Ász" && (!x.roster || x.roster === "main") && (x.refined || 0) >= 2).length * PLACEHOLDER.oracleSuspicion,
  };
  // concealment: negative suspicion (D-259). Base concealment 1 for a dry card other than a VII (D-351), used only by
  // abilities that refer to it; multipliers multiply (D-507); fractions kept, the final total rounds up (D-510), never below 0
  const K = PLACEHOLDER.concealment, base = (x) => (SZARAZ.has(x.rank) && x.rank !== "VII" ? 1 : 0);
  const agri = (x) => x.suit === "Farmfolk";   // "agricultural cargo" isn't defined: read as Farmfolk cards (D-003), provisional
  parts.concealment = -(
    (c.personal.some(FARMFOLK_IX.agriculturalConcealment) ? K.agricultural * c.cargo.filter(agri).length : 0)        // Agricultural Concealment
    + (c.personal.some(CLERGY_IX.highwayFeeExemption) ? K.general : 0)                                               // General Concealment
    + (c.personal.some(TRADES.papers) ? K.professional * c.cargo.filter((x) => x.rank === "Felső").length : 0)       // Professional Concealment
    // base-concealment multipliers multiply per card (D-507): Hidden Compartments 2, Scrap Pile 1.5, False Manifest 2 (Bandits VIII),
    // Plain Goods 1.5 (basic commodities), Innocuous Cargo 1.5 (rank VIII cargo); a card counts its base only when one applies (D-351)
    + all.reduce((a, x) => { const inCargo = c.cargo.includes(x); let k = 1, any = false; const mul = (on, f) => { if (on) { k *= f; any = true; } };
        mul(inCargo && x.suit === "Tradesfolk" && x.rank === "VIII" && x.adjective === "Bulky", 2);
        mul(ALT.weapons(x) && x.adjective === "Battle-Worn" && !x.refined, 1.5);
        mul(inCargo && c.personal.some(BANDITS.papers) && x.suit === "Bandits" && x.rank === "VIII", 2);
        mul(inCargo && c.personal.some(RURAL_T.permit) && E.isCommodity(x) && !x.refined, 1.5);
        mul(inCargo && c.personal.some(AGRI.leaf) && x.rank === "VIII", 1.5);
        mul(inCargo && FISH.basket(x), 1.5);                                      // Fake Bottom (Basket / Barrel of Loaches, cargo)
        mul(inCargo && c.personal.some(FOREST.noble) && x.suit === "Forestfolk" && ["Alsó", "Felső", "Király", "Ász"].includes(x.rank), 1.5);   // Outlaw's Protection (D-304; an Ász has none to raise)
        return a + (any ? k * base(x) : 0); }, 0)
    // Hidden in Plain Sight (Vigilant Crossbowman line, either deck): each gives +3 concealment while Hillfolk valuables (X, Ász) ride
    // in either deck; copies add up (D-368)
    + (all.some((x) => x.suit === "Hillfolk" && (x.rank === "X" || x.rank === "Ász")) ? 3 * all.filter(HILL.vigilant).length : 0)
    + 0.5 * c.cargo.filter(BANDITS.shifty).length                                                                    // Concealed Muscle: half its military
    + (c.personal.some(BEASTS.treebark) ? all.filter((x) => x.suit === "Beasts" && ["Alsó", "Felső", "Király", "Ász"].includes(x.rank)).length : 0)   // Wild Stench (D-256, D-276, D-304)
    // Solitary Hunter: the caravan's only Beasts Felső, Solitary and in cargo: three Felső's base concealment instead of its own
    + (all.filter((x) => x.suit === "Beasts" && x.rank === "Felső").length === 1 && c.cargo.some(BEASTS.solitary) ? 3 : 0)
    );
  const raw = parts.contraband + parts.military + parts.cargo + parts.personal + parts.oracle + parts.bundle + parts.concealment
    + ((state.stops?.[c.at]?.kind === "checkpoint" && c.personal.some(PLAINS.papers)) ? -(state.goodwillVisits || 0) : 0);
  // at the checkpoint only: Checkpoint Influence (automatic) and the Bribery bonuses bought there, as concealment percentages
  // of the total (multipliers multiply, D-507)
  const atCp = state.stops?.[c.at]?.kind === "checkpoint", infl = atCp ? influence(c) : 0, brib = atCp ? (state.cpBribery?.pct || 0) : 0;
  if (infl) parts.influence = -raw * infl;
  // Goodwill (Csikós's Papers in the personal deck): at the map's final checkpoint, -1 per qualifying settlement visit (D-370)
  if (atCp && c.personal.some(PLAINS.papers) && state.goodwillVisits) parts.goodwill = -state.goodwillVisits;
  if (brib) parts.bribery = -raw * (1 - infl) * brib;
  const total = Math.max(0, Math.ceil(raw * (1 - infl) * (1 - brib)));
  // the Royal Castle is the harshest inspection (D-432): its thresholds sit lower (PLACEHOLDER.finalInspection)
  const tier = RULES.inspectionThresholds.map(([min, n]) => [min - (state.final ? PLACEHOLDER.finalInspection.thresholdDrop : 0), n]).find(([min]) => total >= min);
  return { total, parts, inspection: tier ? tier[1] : 0, militaryStrength: military, threshold };
}

// ---------------------------------------------------------------- checkpoint bribery (D-108, D-136, D-397, D-737, D-400)
// Checkpoint Influence (Radiant Clergy Ász in the personal deck): Holywoman 5 %, Oracle 15 %, 20 % with religious-text support
// (a refined Clergy X, Proselytising, D-558); applied at the checkpoint to the suspicion check (piros.md)
export function influence(c) {
  const o = c.personal.filter(CLERGY.radiant); if (!o.length) return 0;
  const best = Math.max(...o.map((x) => x.refined));
  return best >= 2 ? (c.personal.some(CLERGY.proselytising) ? 0.2 : 0.15) : 0.05;
}
// a qualifying ability opens the Bribe after discovery and requirement bribery (D-737): Bribery (Coveted Tradesfolk X in
// cargo) or Checkpoint Influence; Bandits Ász, Mutineer and Liquid Diplomacy aren't in this build
// Liquid Diplomacy (Decadent Authentic Aszú, personal deck) unlocks Checkpoint Bribery; both bribes 15 % cheaper (D-564)
const liquid = (c) => c.personal.some((x) => decadent(x) && x.refined >= 2);
export const canBribe = (c) => c.personal.some(MERC.mutineer) || c.cargo.some(TRADES.coveted) || c.personal.some(CLERGY.radiant) || [...c.cargo, ...c.personal].some(BANDITS.brazen) || liquid(c) || c.personal.some(ALT.lard);   // + The Power of Zsír (D-598)
// Bribery (tok.md): each Coveted Tradesfolk X in cargo buys +10 / 20 / 30 % concealment for 50 / 70 / 90 % of the checkpoint
// toll (CHK-06 reference, PLACEHOLDER), rounded up (D-278); at most two per checkpoint, additive
function briberyOffers(state) {
  const c = state.caravan, used = state.cpBribery?.used || [];
  if (used.length >= 2) return [];
  // Checkpoint Bribery (Brazen Bandits Ász, either deck) uses the same system and scale by its stage (reading; thug.md: "the same
  // underlying bribery system used by Tradesfolk X"), counted against the same two-card limit
  const pool = [...c.cargo.map((card, i) => ({ card, i, deck: "cargo" })), ...c.personal.map((card, i) => ({ card, i, deck: "personal" }))];
  return pool.filter(({ card }) => (TRADES.coveted(card) || BANDITS.brazen(card)) && !used.includes(card)).map(({ card, i, deck }) => {
    const r = card.refined || 0, price = Math.ceil(PLACEHOLDER.checkpointToll * [0.5, 0.7, 0.9][r]);
    return { type: "bribery", i, deck, card, pct: [0.1, 0.2, 0.3][r], price, allowed: c.coins >= price };
  });
}
// requirement bribery (D-108; values CHK-11, PLACEHOLDER): mult x the value of the missing required cards, for at most half
// the required count; needs a qualifying ability (D-737)
const REQ_RANK = { border: "IX", settlers: "Alsó", specialists: "Felső", leaders: "Király" };
// journey progression for bribery scaling (D-108, D-136): Region N of the eight; Region 1 = 1 (scale PLACEHOLDER)
const progression = (state) => 1 + PLACEHOLDER.bribeProgressionStep * ((state.board.region || 1) - 1);
function requirementBribe(state) {
  const r = requirementStatus(state), c = state.caravan, R = PLACEHOLDER.requirementBribe;
  if (r.playtest || r.met || r.kind === "toll" || !canBribe(c)) return null;   // a toll is paid, not bribed away
  // D-108: a maximum based on total monetary value; cost = multiplier x value of the missing cards; scales with progression
  const missing = r.count - r.have, value = missing * cardValue({ rank: REQ_RANK[r.id] || "VIII" }), prog = progression(state);
  if (value > R.maxValue * prog) return { type: "req-bribe", missing, allowed: false, why: `the missing cards are worth ${value}, more than the ${R.maxValue * prog} that can be bribed away` };
  const price = Math.ceil(R.mult * value * prog * (liquid(c) ? 0.85 : 1) * (1 - solitude(c)));
  return { type: "req-bribe", missing, price, allowed: c.coins >= price };
}
// the inspection Bribe (D-136, D-167: a share of current coins; CHK-18 acceptance PLACEHOLDER): the chance grows with the share
// offered and falls with the inspection's size (severity) and after refusing the routine guard (D-168, CHK-21); paid only
// if accepted; a refusal leads to the checkpoint encounter
function inspectionBribes(state) {
  const c = state.caravan, B = PLACEHOLDER.inspectionBribe, ins = state.inspection;
  if (!canBribe(c) || c.coins <= 0) return [];
  // D-136: acceptance depends on the share offered, journey progression and severity (inspection size, D-137); harder after
  // refusing the routine guard (D-168)
  const hard = B.need * (ins.size / 3) * (state.refusedGuard ? B.refusedGuard : 1) * progression(state);
  return B.offers.map((share) => ({ type: "bribe", share, amount: Math.max(1, Math.ceil(c.coins * share * (liquid(c) ? 0.85 : 1) * (1 - solitude(c)))), chance: Math.min(B.maxChance, share / hard) }));
}

// ---------------------------------------------------------------- the checkpoint (D-107, D-133 to D-141, D-158, D-737)
function submit(state) {
  const st = requirementStatus(state);
  // Safe Passage (Juggler's Papers, personal deck): requirements not met: 50 % to pass anyway; the inspection still follows
  if (!st.met && !st.playtest && state.caravan.personal.some(CARNIVAL.papers)) {
    if (state.rng.next() < luck(state, 0.5)) { note(state, `Safe Passage: the guards wave the Juggler's papers through despite ${st.have} of ${st.ask}.`, "good"); st.met = true; }
    else note(state, "Safe Passage: not this time (50%).", "warn");
  }
  // Expedited Inspection: 25 %, a beneficial roll (D-378: roll bonuses apply), once per submission (D-946)
  if (!st.met && !st.playtest && st.expedited) {
    if (state.rng.next() < luck(state, PLACEHOLDER.expeditedChance)) { note(state, `Expedited Inspection: the Fisherman's Papers get your caravan waved past the cargo demand (${st.have} of ${st.count}).`, "good"); st.met = true; }
    else note(state, `Expedited Inspection: the guards insist on the full count this time (${Math.round(PLACEHOLDER.expeditedChance * 100)}%).`, "warn");
  }
  if (!st.met) {
    state.ended = { won: false, reason: st.playtest ? `PLAYTEST requirement not met: ${st.have} of ${st.count} different suits of Rank VIII. The run ends.`
                                                    : st.kind === "toll" ? `You can't pay the toll: ${st.have} of ${st.count} coins. The run ends (D-107).` : `Requirements not met (${st.title}): ${st.have} of ${st.ask}. The run ends (D-107).` };
    note(state, state.ended.reason, "bad"); return;
  }
  if (st.kind === "toll") { state.caravan.coins -= st.count; note(state, `Toll paid: ${st.count} coins to the guards.`, "warn"); }
  else if (st.have >= st.count) note(state, `Requirements met (${st.title}: ${st.have} of ${st.ask}).`, "good");
  const sus = suspicion(state);
  if (sus.inspection) { note(state, `Suspicion ${sus.total}: a scheduled ${sus.inspection === 5 ? "thorough" : "standard"} inspection of ${sus.inspection} cards (D-133).`, "warn"); return inspect(state, sus.inspection, 1); }
  note(state, `Suspicion ${sus.total}: no scheduled inspection (0–10, D-133).`);
  // Routine Check Prevention (Indomitable rural Townsfolk Ász, personal deck): no routine inspection (D-627)
  if (aristocratic(state.caravan, 1)) return pass(state, "Waved through: the guards take the plumed caravan for nobility (Aristocratic, no routine inspection).");
  if (state.caravan.personal.some(RURAL_T.indomitable)) return pass(state, "Waved through: the Shepherd's steady gaze, and nobody asks to look (Routine Check Prevention).");
  if (state.rng.next() < PLACEHOLDER.routineInspectionChance) {                // D-123, D-135: only when none is scheduled
    state.phase = "guard";
    note(state, `A guard leans on the barrier: pay ${guardBribe(state)} coins and nobody looks inside (routine inspection, D-135).`, "warn"); return;
  }
  return pass(state, "Waved through without an inspection.");
}

const guardBribe = (state) => Math.max(1, Math.ceil(PLACEHOLDER.guardBribe * (1 - solitude(state.caravan))));   // Solitude
function payGuard(state) {
  state.caravan.coins -= guardBribe(state);
  note(state, `Paid the guard ${guardBribe(state)} coins.`);
  pass(state, "The guard lifts the barrier.");
}

// draw at random from cargo and personal deck combined, without replacement (D-134; second draw from the full remaining pool, D-166)
function inspect(state, size, n) {
  const c = state.caravan;
  const pool = [...c.cargo.map((card) => ({ card, from: "cargo" })), ...c.personal.map((card) => ({ card, from: "personal" }))];
  const drawn = [];
  for (let k = 0; k < size && pool.length; k++) drawn.push(pool.splice(Math.floor(state.rng.next() * pool.length), 1)[0]);
  // Misinformation (Artful Townsfolk Felső, personal deck): each drawn card's report may be falsified, freshly each time; the
  // cargo isn't changed; it may help or harm (D-397: the report, not the suspicion; the algorithm is implementation)
  if (c.personal.some(TOWNS.artful)) for (const d of drawn) if (state.rng.next() < PLACEHOLDER.misinformation) d.report = state.rng.pick(RANKS_);
  const shows = (d) => d.report || d.card.rank;
  // Sweet Talk (mercenary #2, from Impresario): one inspected card that would be a find is redrawn as another random cargo card,
  // never the same one; the new result stands (D-362, D-365)
  if (c.personal.some(MERC.sweetTalk)) {
    const hits = drawn.filter((d) => shows(d) === "X" || shows(d) === "Ász"), others = c.cargo.filter((x) => !drawn.some((d) => d.card === x));
    if (hits.length && others.length) { const h = state.rng.pick(hits), k = drawn.indexOf(h); drawn[k] = { card: state.rng.pick(others), from: "cargo" }; note(state, "Sweet Talk: the Impresario talks an inspector into looking at something else.", "good"); }
  }
  const found = drawn.filter((d) => shows(d) === "X" || shows(d) === "Ász");                   // discovery: X/Ász (D-136)
  state.inspection = { n, size, drawn, found };
  note(state, `Inspection ${n} (${size} cards): ${drawn.map((d) => `${d.report ? `${d.card.rank} (reported as ${d.report})` : d.card.rank} ${d.card.suit}${d.from === "personal" ? " (personal)" : ""}`).join(", ")}.`
    + (found.length ? ` Contraband found: ${found.length}.` : " Nothing found."), found.length ? "bad" : "good");
  if (!found.length) return pass(state, "The inspectors find nothing and wave you on.");
  state.phase = "discovery";
}

// Field Medicine (Restorative Clergy VIII, cargo): each one protects one face card (Alsó, Felső, Király, Ász; D-304) from loss in
// a non-Zsír encounter: the cards surrendered to a checkpoint inspection, a minor checkpoint or a patrol (your ruling, 2026-11-05,
// settles UI-C-21 for these). Protections stack; which cards are saved is random (D-415); the medicine isn't used up
// Also cards lost in ambushes (taken by the ambushers) and confiscated in a checkpoint fight (your ruling, D-939)
const FACE = new Set(["Alsó", "Felső", "Király", "Ász"]);
// the face cards saved, at random, one per Restorative Clergy VIII in cargo; cand: the face cards at risk in this loss
function medicine(state, cand) {
  const n = state.caravan.cargo.filter(CLERGY.restorative).length, saved = [], pool = cand.slice();
  for (let k = 0; k < n && pool.length; k++) saved.push(pool.splice(Math.floor(state.rng.next() * pool.length), 1)[0]);
  if (saved.length) note(state, `Field Medicine: ${saved.map((x) => cardName(x.card || x)).join(", ")} ${saved.length === 1 ? "is" : "are"} patched up and kept.`, "good");
  return saved;
}
function fieldMedicine(state, found) {
  const saved = medicine(state, found.filter((d) => FACE.has(d.card.rank)));
  return found.filter((d) => !saved.includes(d));
}
function surrender(state) {
  const c = state.caravan, { n } = state.inspection, found = fieldMedicine(state, state.inspection.found);
  for (const d of found) { const deck = d.from === "cargo" ? c.cargo : c.personal; deck.splice(deck.indexOf(d.card), 1); }
  if (found.length) note(state, `Surrendered ${found.map((d) => `${d.card.rank} ${d.card.suit}`).join(", ")}: removed permanently (D-136).`, "warn");
  c.capacity = capacity(c);
  if (lostRun(state)) return;
  if (n === 1) {                                                                // a second inspection of random size (D-137; sizes PLACEHOLDER)
    const size = state.rng.pick(PLACEHOLDER.secondInspectionSizes);
    note(state, `Surrendering triggers a second inspection: ${size} cards.`, "warn");
    return inspect(state, size, 2);
  }
  pass(state, "Surrendering after the second inspection ends the procedure.");   // no third inspection
}

function fight(state) {
  if (detonates(state)) return;
  const c = state.caravan;
  note(state, "You fight: a checkpoint encounter against two King's Men, played with your own cargo as the deck (D-158).", "warn");
  const dep = deployed(c);
  const m = checkpointMatch({ rng: state.rng, cargo: c.cargo, playerPersonal: dep.personal, companion: dep.companion, value: cardValue, suits: state.stops[c.at].suits,
                              trickLimit: PLACEHOLDER.checkpointTrickLimit, onPlay: onPlay(state.rng), onTrick: onTrick(state.rng, state.caravan.personal, state.caravan.cargo) });
  m.richer = wealthTest(state, [state, null, state, null]); if (dep.companion) m.mercHalf = dep.companion.half;
  state.match = { m, at: c.at, kind: "checkpoint" }; state.phase = "match";
}

// D-140, D-141, D-169, D-219: only cards that entered a trick change hands; survival = 8+ cargo cards afterwards
function finishCheckpointMatch(state) {
  const { m } = state.match, c = state.caravan, o = checkpointOutcome(m); mercShare(state, m);
  // Return from Confiscation (Star-Eyed Shepherd): lost in the checkpoint fight, he comes back where he came from, before the
  // 8-card check (D-627): cargo to cargo, the personal deck to the personal deck (D-903), also when he'd ride on as cargo (D-140)
  const back = (xs) => xs.filter((x) => x.ref && RURAL_T.starEyed(x.ref));
  const bc = back(o.cargoLost), bp = [...back(o.personalLost), ...back(o.personalToCargo)];
  if (bc.length) o.cargoLost = o.cargoLost.filter((x) => !bc.includes(x));
  if (bp.length) { o.personalLost = o.personalLost.filter((x) => !bp.includes(x)); o.personalToCargo = o.personalToCargo.filter((x) => !bp.includes(x)); }
  if (bc.length || bp.length) note(state, `Return from Confiscation: the Star-Eyed Shepherd walks back to your ${bp.length ? "personal deck" : "wagon"}.`, "good");
  // Field Medicine (Restorative Clergy VIII in cargo): one face card each, kept from the King's Men's confiscation (D-939)
  { const saved = medicine(state, [...o.cargoLost, ...o.personalLost].filter((x) => FACE.has(x.rank)));
    o.cargoLost = o.cargoLost.filter((x) => !saved.includes(x)); o.personalLost = o.personalLost.filter((x) => !saved.includes(x)); }
  const lostCargo = new Set(o.cargoLost.map((x) => x.ref)), lostPers = new Set([...o.personalLost, ...o.personalToCargo].map((x) => x.ref));
  c.cargo = c.cargo.filter((x) => !lostCargo.has(x));
  c.personal = c.personal.filter((x) => !lostPers.has(x));
  const recovered = o.personalToCargo.map((x) => plain(x.ref)), taken = o.kingsMenTaken.map(plain);
  c.cargo.push(...recovered, ...taken, ...m.generated);
  if (m.coins) { c.coins += m.coins; note(state, `Collection Plate earned you ${m.coins} coin${m.coins === 1 ? "" : "s"}.`, "good"); }
  const list = (a, f = (x) => `${x.rank} ${x.suit}`) => a.map(f).join(", ");
  const pts = (t) => m.captured[t].filter((x) => x.rank === "X" || x.rank === "Ász").length * 10;
  note(state, `Checkpoint encounter over: points ${pts(0)}–${pts(1)}, which don't decide survival (D-141); the cargo you keep does.`);
  if (o.cargoLost.length) note(state, `Cargo seized: ${list(o.cargoLost)}.`, "bad");
  if (o.personalLost.length) note(state, `Personal cards captured by the King's Men, lost for good: ${list(o.personalLost)}.`, "bad");
  if (o.personalToCargo.length) note(state, `Your played personal cards, recovered, now ride as cargo (D-140): ${list(o.personalToCargo)}.`
    + (o.personalToCargo.some((x) => x.refined && x.rank === "IX") ? " Farmer's Papers works only in the personal deck: its passives, including the 40-card capacity, stop." : ""), "warn");
  if (o.kingsMenTaken.length) note(state, `King's Men cards captured into your cargo: ${list(o.kingsMenTaken)}.`, "good");
  if (m.generated.length) note(state, `Travelling Merchant: ${list(m.generated, (x) => `${x.suit} VIII (Refinement I)`)} joins your cargo.`, "good");
  state.match = null; c.capacity = capacity(c);
  // recruitable: only the King's Men cards captured; your own recovered cards aren't captures (D-869) and a recovered
  // personal card stays cargo (D-140). The survival check comes after recruitment and overflow (D-732)
  postMatch(state, taken, () => pass(state, `You come through with ${c.cargo.length} cargo cards.`));
}

function pass(state, how) {
  state.inspection = null;
  const n = regionNo(state);
  state.run?.regions.push(n);
  if (state.final) { const sale = castleSale(state);
    state.caravan.coins += sale.total; state.run.castle = sale; state.caravan.cargo = [];
    state.ended = { won: true, final: true, reason: `${how} The Royal Castle buys your ${sale.cards.length} delivered cargo cards for ${sale.total} coins. The run is won (D-328, D-433).` };
  } else if (n < 8) state.ended = { won: true, crossing: n + 1, reason: `${how} Region ${n} complete: the road into Region ${n + 1} lies open.` };
  else state.ended = { won: true, reason: `${how} Region ${n} complete.` };
  note(state, state.ended.reason, "good");
}

// ---------------------------------------------------------------- the Capital Region: Castle Town, the Royal Castle, the score
// The castle buys all delivered cargo by its suit preferences (D-433, D-146), plus the King's own random preference, known only on
// reaching the Capital Region (D-434). Multipliers PLACEHOLDERS (PLACEHOLDER.castle)
function castlePreferences(state) {
  const r = state.rng, P = PLACEHOLDER.castle, suits = ALL_SUITS_.slice();
  const up = r.pick(suits), down = r.pick(suits.filter((x) => x !== up)), king = r.pick(suits.filter((x) => x !== up && x !== down));
  state.castle = { up, down, king };
  note(state, `Word in the Capital Region of the Royal Castle's tastes: it pays well for ${up} (×${P.up}), poorly for ${down} (×${P.down}); the King himself covets ${king} (×${P.king}).`, "event");
}
export function castlePrice(state, card) {
  const P = PLACEHOLDER.castle, k = state.castle || {};
  return Math.max(1, Math.round(cardValue(card) * P.base * (card.suit === k.king ? P.king : card.suit === k.up ? P.up : card.suit === k.down ? P.down : 1)));
}
function castleSale(state) { const cards = state.caravan.cargo.slice(); return { cards, total: cards.reduce((a, x) => a + castlePrice(state, x), 0) }; }
/** the run's score (D-416, D-748): six components, every run scored, failed ones too; weights PLACEHOLDERS (PRG-01) */
export function runScore(state) {
  const c = state.caravan, W = PLACEHOLDER.scoreWeights, R = state.run || { earned: 0, spent: 0, tricks: 0, games: 0 }, inv = investedWealth(c);
  const parts = {
    "personal deck value": c.personal.reduce((a, x) => a + cardValue(x), 0),
    "remaining cargo value": R.castle ? R.castle.total : c.cargo.reduce((a, x) => a + cardValue(x), 0),   // the castle's sale (your ruling)
    "money spent": R.spent,
    "tricks won": R.tricks,
    "matches won": R.games,
    "money earned": R.earned - (R.castle ? R.castle.total : 0) + inv.principal + inv.uncollected,
  };
  return { parts, total: Math.round(Object.entries(parts).reduce((a, [k, v]) => a + v * (W[k] ?? 1), 0)) };
}
// D-417's smuggling premium: a foreign-origin X or Ász sold to a Fence fetches more the farther it has come from its origin
// region, by geographical separation (region centres on the world map), not region numbers. PLACEHOLDERS (premiums at balancing)
let WORLD = null;
export function setWorldMap(w) { WORLD = w; }
export function smuggleDistance(from, to) {
  const R = WORLD?.regions; if (!R || !R[from] || !R[to] || from === to) return 0;
  const ctr = (q) => [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2], [ax, ay] = ctr(R[from]), [bx, by] = ctr(R[to]);
  return Math.round(Math.hypot(ax - bx, ay - by));
}
export function smugglePrice(state, card) {
  const P = PLACEHOLDER.smuggle, d = smuggleDistance(card.home, regionNo(state));
  return Math.max(1, Math.round(cardValue(card) * P.base * (1 + d * P.perCell)));
}

export function describe(s) {
  if (s.kind === "settlement") return `${s.name} (${s.tier})`;
  if (s.kind === "poi") return `${s.name} (${s.poi})`;
  if (s.kind === "encounter") return "an encounter point";
  return s.kind === "checkpoint" ? "the Checkpoint" : s.kind === "start" ? "the starting point (D-160)" : "the entry checkpoint";
}
