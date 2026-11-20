// Road encounters for Region 1 (D-678 B4: peddlers, battle encounters and other events WITH fully documented resolution;
// events without a defined resolution are excluded; no invented rewards). Catalogue: docs/design/encounter-catalogue.md.
// Rules live here and in engine.js; every number is a PLACEHOLDER in rules.js (PLACEHOLDER.enc).
import { PLACEHOLDER, RANKS } from "./rules.js";
import { COMMODITY_STAGES } from "./commodity-data.js";

/** Which encounters are built, and why the others aren't. "built" = complete rules (numbers may be placeholders). */
export const CATALOGUE = {
  "travelling peddler":     { status: "built", rules: "D-678 B4, D-796, D-354" },
  "found treasure":         { status: "built", rules: "D-804" },
  "lost traveller":         { status: "built", rules: "D-421, D-798, D-799" },
  "broken-down caravan":    { status: "built", rules: "D-796, D-797" },
  "blocked road":           { status: "built", rules: "D-793, D-794, D-806 (16)" },
  "inn":                    { status: "built", rules: "D-807, D-811" },
  "Bandits ambush":         { status: "built", rules: "D-174 to D-227, D-800, D-801, D-814" },
  "Beasts ambush":          { status: "built", rules: "D-174 to D-227, D-800, D-801, D-813 (military a placeholder: open)" },
  "abandoned wagon":        { status: "built", rules: "D-804, D-805" },
  "dubious toll collectors":{ status: "built", rules: "D-801 (10), D-808, D-809, D-815 (toll and military placeholders: open)" },
  "King's Men patrol":      { status: "built", rules: "D-803, D-923 (below military 2: the minor checkpoint's spot check, D-808)" },
  "pilgrims":               { status: "built", rules: "D-795, D-796, D-797, D-881" },
  "festival":               { status: "built", rules: "D-795, D-798, D-805, D-881" },
  "travelling craftsman":   { status: "built", rules: "D-796, D-882" },
  "deserters":              { status: "built", rules: "D-801 (9), D-815, D-882" },
  "minor checkpoint":       { status: "built", rules: "D-806 (15), D-808, D-882" },
  "travelling mercenaries": { status: "built", rules: "D-393, D-806 (14), D-922" },
};

/** the encounters this caravan can draw here: built ones only (B4); the blocked road only where a parallel stop exists (D-806) */
export function drawable(stop, ctx) {
  return Object.entries(stop.odds || {}).filter(([ev]) => {
    const c = CATALOGUE[ev];
    if (!c || !c.status.startsWith("built")) return false;
    if (ev === "blocked road") return ctx.parallelStops.length > 0;
    return true;
  });
}

// ---------------------------------------------------------------- cards
const stagesOf = (pred) => COMMODITY_STAGES.filter((s) => s.roster !== "secret alternative" && pred(s));   // Almighty Lard never (D-643)
export const cardFromStage = (s) => ({ rank: s.rank, suit: s.suit, ...(s.stage ? { refined: s.stage } : {}), name: s.name, roster: s.roster, tags: s.tags });
export const baseCommodity = (rng, suits) => {
  const opts = stagesOf((s) => s.stage === 0 && s.roster === "main" && suits.includes(s.suit));
  return cardFromStage(rng.pick(opts.length ? opts : stagesOf((s) => s.stage === 0 && s.roster === "main")));
};
export const tagged = (tag, pred = () => true) => stagesOf((s) => s.tags.includes(tag) && pred(s));
export const tagsOf = (c) => {
  if (c.tags) return c.tags;
  const s = COMMODITY_STAGES.find((x) => x.suit === c.suit && x.rank === c.rank && x.roster === (c.roster || "main") && x.stage === (c.refined || 0));
  return s ? s.tags : [];
};
const isCommodity = (c) => c.rank === "VIII" || c.rank === "X";   // commodities are VIII and X (D-382)

/** commodity draws: 90 % VIII, 10 % X (D-813 to D-815) */
function commodityFrom(rng, stages) {
  const want = rng.next() < 0.9 ? "VIII" : "X";
  const opts = stages.filter((s) => s.rank === want);
  return cardFromStage(rng.pick(opts.length ? opts : stages));
}

/** a hostile non-caravan opponent's generated pool (D-801, D-813 to D-815); Region 1: no upgrades on faction cards (D-450) */
export function hostilePool(rng, kind, localSuits) {
  const n = PLACEHOLDER.enc.hostilePoolSize, out = [];
  const factionCard = (suit) => {
    const rank = rng.pick(RANKS);
    const base = isCommodity({ rank }) && COMMODITY_STAGES.find((x) => x.suit === suit && x.rank === rank && x.roster === "main" && x.stage === 0);
    return base ? cardFromStage(base) : { rank, suit };
  };
  const groups = {
    "Bandits ambush": [() => factionCard("Bandits"), () => commodityFrom(rng, tagged("illicit")),
                       () => commodityFrom(rng, stagesOf((s) => localSuits.includes(s.suit) && (s.tags.includes("valuable") || s.tags.includes("essential"))))],
    "Beasts ambush": [() => factionCard("Beasts"), () => commodityFrom(rng, tagged("wild"))],
    "dubious toll collectors": [() => factionCard("King's Men"),
                       () => commodityFrom(rng, stagesOf((s) => localSuits.includes(s.suit) && (s.tags.includes("valuable") || s.tags.includes("essential"))))],
    // D-815: deserters carry military stages plus food and essential stages (provisions and stolen supplies)
    "deserters": [() => commodityFrom(rng, tagged("military")), () => commodityFrom(rng, stagesOf((s) => s.tags.includes("food") || s.tags.includes("essential")))],
  }[kind === "minor checkpoint" ? "dubious toll collectors" : kind];          // D-882: the minor checkpoint uses the toll collectors' pool
  for (let i = 0; i < n; i++) out.push(rng.pick(groups)());   // equal group mix: PLACEHOLDER (D-814)
  return out;
}

/** Exposure by military ratio (D-880, replacing D-174's additive formula; the base is still floor(cargo / 4)):
 *  roughly equal (less than 1.5x) -> both expose the base; the stronger side 1.5x to 2x -> it exposes nothing, the weaker
 *  the base; the stronger more than 2x -> it exposes nothing, the weaker double the base. Never more than a side holds. */
export function exposure(cargoA, milA, cargoB, milB) {
  const a = Math.ceil(milA), b = Math.ceil(milB), baseA = Math.floor(cargoA / 4), baseB = Math.floor(cargoB / 4);
  const strong = Math.max(a, b), weak = Math.min(a, b), ratio = weak === 0 ? (strong === 0 ? 1 : Infinity) : strong / weak;
  let ea = baseA, eb = baseB;
  if (ratio >= PLACEHOLDER.enc.ratioStrong) {
    const mult = ratio > 2 ? 2 : 1;
    if (a > b) { ea = 0; eb = baseB * mult; } else { eb = 0; ea = baseA * mult; }
  }
  return [Math.min(ea, cargoA), Math.min(eb, cargoB)];
}
/** D-220 (provisional): trick limit by combined exposure */
export const ambushTrickLimit = (combined) => (combined <= 4 ? 2 : combined <= 8 ? 3 : 4);

/** D-177: eligible cargo shown in random groups of four; reshuffled after each pick */
export function groupsOf(rng, cards) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const g = []; for (let i = 0; i < a.length; i += 4) g.push(a.slice(i, i + 4));
  return g;
}

/** A POI's encounter deck (D-878): four suits, 8 cards each, ranks as everywhere (D-406); the POI's character lies in WHICH
 *  cards appear. (1) A commodity slot (VIII, X) of a suit with alternative cards picks one at random (D-487, D-495).
 *  (2) Mines lean to their minerals (D-643; ore or salt, D-759): an ore mine's Hillfolk VIII is Ore or Copper Ore and its X
 *  leans to Silver and Gold Ore; a salt mine's Hillfolk VIII leans to Rock Salt. (3) Rewards by type (D-725, D-872): a slot
 *  may hold a valuable or upgraded stage instead. All chances are PLACEHOLDERS (rules.js). */
// Which roster a location deals for a suit. Tradesfolk (D-530, D-554): Tier I villages the rural roster; Tier II market towns
// the rural roster, the urban one, or a mixed deck (one card per rank, each from either), chosen at random (reading); otherwise
// the urban roster. Every other suit: its main roster with its single alternative swaps (D-487); the rural Townsfolk and
// agricultural Beasts rosters aren't dealt until their placement is ruled (D-606, D-489)
// Rural Townsfolk follows the same rule as Tradesfolk (your ruling, 2026-11-04; D-606). Beasts: the place's roster from the
// map (beasts_roster: agricultural where open land outweighs forest and marsh, D-489), never mixed in an ordinary deck
export const ROSTER_NAMES = {
  "rural roster|Tradesfolk": { VII: "Spearman", VIII: "Ironware", IX: "Travel Pass (Rural)", X: "Chest", "Alsó": "Porter", "Felső": "Peddler", "Király": "Mercer", "Ász": "Cart" },
  "rural roster|Townsfolk": { VII: "Volunteer", VIII: "Bolted Flour", IX: "Travel Pass (Rural)", X: "Grooved Millstone", "Alsó": "Herb Gatherer", "Felső": "Mill Hand", "Király": "Sworn Councillor", "Ász": "Shepherd" },
  "agricultural roster|Beasts": { VII: "Locust Swarm", VIII: "Feathers", IX: "Travel Papers (Agricultural)", X: "Chamomile", "Alsó": "Fox", "Felső": "Jackal", "Király": "Badger", "Ász": "Bustard" },
};
export const RURAL_TRADES_NAMES = ROSTER_NAMES["rural roster|Tradesfolk"];
export function rosterChooser(rng, tier, beastsRoster) {
  const tierMode = () => (tier === "village" ? "rural" : tier === "market town" ? rng.pick(["rural", "urban", "mixed"]) : "urban");
  const modes = { Tradesfolk: tierMode(), Townsfolk: tierMode() };
  return (suit) => {
    if (suit === "Beasts") return beastsRoster === "agricultural" ? "agricultural roster" : "main";
    const mode = modes[suit];
    return !mode || mode === "urban" ? "main" : mode === "rural" ? "rural roster" : (rng.next() < 0.5 ? "rural roster" : "main");
  };
}
const inRoster = (s, roster) => (roster === "main" ? s.roster === "main" || s.roster === "alternative" : s.roster === roster);
// environment weighting of a suit's commodity variants (method B, D-642; placements D-643, D-644; D-1193): odds influences only,
// never restrictions; a refinement chain follows its base (the base stage is what's chosen); the place's surroundings come from the
// region file (stop.env: land and water shares within the occupation radius). Strengths are PLACEHOLDERS
const VARIANT_WEIGHT = {
  Parchment: (x) => (x.poi === "monastery" ? 2 : 1), Reliquary: (x) => (x.poi === "monastery" ? 2 : 1),          // special sites raise odds
  "Broken Weapons": (x) => (x.kind === "checkpoint" || x.poi === "military camp" || x.castle ? 2 : 1),          // castles, checkpoints, camps
  Grapes: (x) => 1 + 2 * (x.env.hills || 0), "Sweet Grapes": (x) => 1 + 2 * (x.env.hills || 0),                // fields, hills raise odds
  Millet: (x) => ((x.suits || []).includes("Plainsfolk") ? 2 : 1),                                              // more likely than Wheat with Plainsfolk
  Ore: (x) => 1 + (x.env.hills || 0) + (x.env.mountains || 0), "Copper Ore": (x) => 1 + (x.env.hills || 0) + (x.env.mountains || 0),
  "Rock Salt": (x) => 1 + (x.env.hills || 0) + (x.env.mountains || 0), "Silver Ore": (x) => 1 + (x.env.hills || 0) + (x.env.mountains || 0),
  "Gold Ore": (x) => 1 + (x.env.hills || 0) + (x.env.mountains || 0),                                         // hills and mountains
  Reeds: (x) => ((x.env.marsh || 0) > 0.3 ? 1 : 0.5 + 2 * (x.env.marsh || 0)),                                 // marsh 50/50 kept; elsewhere wetland
  Loach: (x) => ((x.env.marsh || 0) > 0.3 ? 1 : 0.5 + 2 * ((x.env.river || 0) + (x.env.lake || 0))),          // and shoreline influence
  Egret: (x) => 1 + 4 * (x.env.marsh || 0), Sterlet: (x) => 1 + (x.env.river || 0) + (x.env.lake || 0),        // Egret strongly marsh
  "Plains Pig": (x) => 1 + 2 * (x.env.forest || 0),                                                             // pigs near forests
  "Wild Horse": (x) => (1 + 2 * (x.env.large_flatland || 0)) * (x.kind === "settlement" ? 0.7 : 1.3),          // open flatland, away from settlements
  "Willow Branches": (x) => 1 + 2 * ((x.env.river || 0) + (x.env.marsh || 0)),                                 // rivers, floodplains, marshes
  "Beaver Pelt": (x) => 1 + 2 * ((x.env.river || 0) + (x.env.lake || 0) + (x.env.marsh || 0)),                 // rivers, lakes, wetlands
  "Bone Dice": (x) => (x.kind === "settlement" ? 1.5 : 1), Koboz: (x) => (x.kind === "settlement" ? 1.5 : 1),  // around settlements, any size
};
function weightedPick(rng, opts, ctx) {
  if (!ctx || opts.length < 2) return rng.pick(opts);
  const w = opts.map((o) => (VARIANT_WEIGHT[o.name] ? VARIANT_WEIGHT[o.name]({ env: {}, ...ctx }) : 1)), tot = w.reduce((a, b) => a + b, 0);
  let x = rng.next() * tot; for (let i = 0; i < opts.length; i++) { x -= w[i]; if (x < 0) return opts[i]; } return opts[opts.length - 1];
}
/** a place's context for the weighting: its surroundings, kind, POI identity and suits */
export const placeCtx = (stop) => (stop ? { env: stop.env || {}, kind: stop.kind, poi: stop.poi, suits: stop.suits || [], castle: !!stop.castleTown } : null);
export function poiDeckCard(rng, poiType, mine, tier, beastsRoster, ctx = null) {
  const P = PLACEHOLDER.poiRewards[poiType] || {}, M = PLACEHOLDER.mineLean, rosterOf = rosterChooser(rng, tier, beastsRoster);
  return (rank, suit) => {
    const roster = rosterOf(suit);
    if (roster !== "main" && !isCommodity({ rank })) return { roster, name: ROSTER_NAMES[`${roster}|${suit}`]?.[rank] };
    if (roster !== "main") { const o = stagesOf((s) => s.suit === suit && s.rank === rank && s.stage === 0 && s.roster === roster); return o.length ? cardFromStage(rng.pick(o)) : {}; }
    if (rank === "Ász" && P.aszUpgraded && rng.next() < P.aszUpgraded) return { refined: 1 };   // monastery: an upgraded Ász (D-725)
    if (!isCommodity({ rank })) return {};
    const pick = (pred) => { const o = stagesOf((s) => s.suit === suit && s.rank === rank && inRoster(s, "main") && pred(s)); return o.length ? cardFromStage(rng.pick(o)) : null; };
    if (P.upgraded && rng.next() < P.upgraded) { const c = pick((s) => s.stage >= 1 && s.tags.includes("valuable")) || pick((s) => s.stage >= 1); if (c) return c; }
    if (P.valuable && rng.next() < P.valuable) { const c = pick((s) => s.tags.includes("valuable")); if (c) return c; }   // valuables are mostly refined stages
    if (P.tagLean && rng.next() < P.tagLean.chance) { const c = pick((s) => P.tagLean.tags.some((t) => s.tags.includes(t))); if (c) return c; }
    if (mine && suit === "Hillfolk") {
      const lean = M[mine]?.[rank];
      if (lean && rng.next() < lean.chance) { const c = pick((s) => s.stage === 0 && lean.names.includes(s.name)); if (c) return c; }
    }
    { const o = stagesOf((s) => s.suit === suit && s.rank === rank && inRoster(s, "main") && s.stage === 0);   // D-487 versions, weighted by the place (D-642)
      return o.length ? cardFromStage(weightedPick(rng, o, ctx)) : {}; }
  };
}

/** what a POI's deck is like, for the player (D-725, D-643) */
export function poiDeckNote(stop) {
  const mineral = stop.mine === "ore" ? "ore, copper, silver and gold" : stop.mine === "salt" ? "rock salt" : null;
  return { "cave": "its deck holds more valuable goods than a settlement's (D-725).",
           "abandoned ruins": "its deck holds more rare and upgraded goods than a settlement's (D-725).",
           "abandoned mine": `its deck leans to ${mineral || "minerals"} and holds scavenged valuables (D-643, D-725).`,
           "active mine": `its deck leans to ${mineral || "minerals"} (D-643).`,
           "bandit-overrun village": "its deck holds more loot: coin goods and valuables (D-725).",
           "military camp": "its deck leans to military goods (D-725).",
           "monastery": "its deck holds more upgraded goods, valuables and upgraded Ász cards (D-725)." }[stop.poi] || null;
}

// which commodity line a card belongs to (the base stage's name: Wheat for Wheat, Flour and Provisions; Millet for Millet ...)
const LINE = (() => { const m = new Map(); let base = null;
  for (const st of COMMODITY_STAGES) { if (st.stage === 0) base = st.name; m.set(`${st.suit}|${st.rank}|${st.roster}|${st.name}`, base); } return m; })();
export function lineOf(c) {
  if (!isCommodity(c)) return null;
  const nm = c.name || stageName(c); if (!nm) return null;
  const direct = LINE.get(`${c.suit}|${c.rank}|${c.roster || "main"}|${nm}`); if (direct) return direct;
  const st = stageName(c);                                  // an upgraded card is named "<Adjective> <stage>"
  if (st && nm.endsWith(" " + st)) return LINE.get(`${c.suit}|${c.rank}|${c.roster || "main"}|${st}`) || null;
  for (const [k, v] of LINE) { const [su, rk, ro, n] = k.split("|"); if (su === c.suit && rk === c.rank && ro === (c.roster || "main") && nm.endsWith(" " + n)) return v; }
  return null;
}

export function stageName(c) {
  if (!isCommodity(c)) return null;
  const s = COMMODITY_STAGES.find((x) => x.suit === c.suit && x.rank === c.rank && x.roster === (c.roster || "main") && x.stage === (c.refined || 0));
  return s ? s.name : null;
}

export { isCommodity, stagesOf, commodityFrom };
