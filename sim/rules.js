// Rules data for the simulation (D-857: the simulation owns state and rules; the interface only displays and asks).
// Every number below is either a ruled value (with its decision) or a PLACEHOLDER (labelled, for balancing; D-857).

export const RULES = {
  stopsPerRegion: 8,                       // D-693, D-782 (test configuration)
  cargoMinimum: 8,                         // D-138: below 8 cargo cards the run ends
  highwayToll: 5,                          // D-118, D-837: charged on every highway entry
  waterFare: 3,                            // D-824 (4), provisional
  // paid crossings carry their own fee in the board data (D-818: 3, provisional)
  emergencyReturnCost: 10,                 // D-323 (round trip)
  emergencyReturnRounds: 2,                // D-109: one turn back, one to return
  restockFee: 2,                           // D-859 (4), provisional
  // checkpoint requirement: a drawn scenario (D-875), see checkpoint-scenarios.js (replaces D-678 B1's fixed four Rank IX)
  inspectionThresholds: [[16, 5], [11, 3]],  // D-133: suspicion 16+ -> 5 cards, 11-15 -> 3, 0-10 none
  capacity: 32,                            // D-714: default wagon capacity
  capacityFarmfolk: 40,                    // D-714, D-744: Farmfolk's starting IX grants 40
  marketBuy: 2.0,                          // D-675's purchase price, now only the Tavern's food (Markets, peddlers, inns, fences: below)
  marketSell: 0.5,                         // D-675's sale price, now only the AI's rough worth estimate
  // trading by the card's suit (supersedes D-675's flat spread; your ruling, 2026-11-05): where the suit lives it's cheap to buy
  // and sells low; where it doesn't, it costs more and sells at value. Demand up / down applies on top (D-146)
  buyPresent: 0.75, buyAbsent: 1.25,       // x card value; 1.25 rounded up
  sellPresent: 0.5, sellAbsent: 1.0,
  modifierCap: 0.6,                        // D-592: combined percentage modifiers capped at 60 %
  marketCommodityRank: "VIII",             // Markets sell commodities (VIII, X) of the suits present (D-825 (5)); never X (D-663)
};

// PLAYTEST MODE (Milestone A only; your ruling 2026-11-04): replaces the checkpoint condition, never the canonical rule
// above. Removed when encounter-deck captures (the real source of Rank IX) exist. Needs travel and trading: three Rank VIII
// commodities of three different suits, none of the caravan's own civilisation, i.e. bought at settlements whose suits differ.
export const PLAYTEST = {
  label: "PLAYTEST requirement: 3 × Rank VIII of 3 different suits (not Farmfolk)",
  rank: "VIII", count: 3, excludeSuit: "Farmfolk",
};

export const PLACEHOLDER = {
  startingCoins: 20,                       // PLACEHOLDER: CAR-08 is open
  // D-861: a card payment draws a random cargo card, weighted towards száraz cargo (not X or Ász)
  cardPaymentWeight: { szaraz: 3, rich: 1 },   // PLACEHOLDER weights
  tempLocationMatchChance: 0.75,           // PLACEHOLDER (D-873, was 0.35): D-425 "may reveal a Zsír encounter or none"; frequency at balancing
  // Card value: D-539's ability-based table doesn't exist yet (D-675 flags the dependency). PLACEHOLDER: the documented
  // base values, explicitly "starting values only" (roadmap; src:5653-5672), with no refinement or ability component.
  cardValue: { "Alsó": 1, "Felső": 2, "VIII": 3, "Király": 4, "IX": 5, "VII": 6, "X": 10, "Ász": 11 },
  demandUp: 0.5, demandDown: 0.5,          // PLACEHOLDER: SET-11 multipliers are open (+50 % / -50 %, within D-592's cap)
  stockSize: { village: 2, "market town": 3, town: 4, city: 6 },   // PLACEHOLDER: SET-05 inventory sizes are open
  refreshPerRound: 1,                      // PLACEHOLDER: cards a settlement restocks each round (D-110 says it changes, not how)
  // (refined values: base + the upgrades' value to the player, D-942; the VIII 3 -> 6 -> 10 placeholder is retired)
  checkpointTrickLimit: 8,                 // PLACEHOLDER: D-172 checkpoint "about 8"
  // concealment = negative suspicion (D-259); the IX amounts are balance values (TBD; card valuation swept 1-3 points)
  concealment: { agricultural: 0.25, general: 2, professional: 0.5 },   // per agricultural cargo card / flat / per Felső in cargo
  // checkpoint bribery (D-108, D-136, D-397, D-737; RW-02 via CHK-07). All PROVISIONAL:
  checkpointToll: 8,                        // CHK-06: reference only (highway 5 + crossing 3); no checkpoint charges it
  inspectionBribe: { offers: [0.25, 0.5, 0.75, 1], need: 0.4, refusedGuard: 1.5, maxChance: 0.95 },   // CHK-18, CHK-21
  requirementBribe: { mult: 3, maxValue: 15 },   // CHK-11 (D-108): cost = mult x value of the missing cards; capped by their total value
  bribeProgressionStep: 0.25,               // D-108, D-136: bribery scales with journey progression (+25 % per region after the first)
  // Townsfolk (urban.md leaves these TBD): Kickbacks odds and coins by settlement size; Local Discount; Misinformation's
  // chance to falsify each inspected card's report
  kickbacks: { coinChance: 0.5, coins: { village: 1, town: 2, city: 3 } },
  localDiscount: 0.1,
  misinformation: 0.3,
  blackMarket: [2, 3, 4],                  // Black Market income at a town by stage (Mandrake / Essence / Witch's Elixir); thug.md: TBD
  marchingFormation: 1,
  beastDefence: 1,
  inspectCaravanCards: 3,
  forestToll: 5,
  dividendPerRound: 0.01,
  // ---- the full run (D-326, D-432, D-433, D-416, D-417): all balance values
  // the share of cards upgraded, rising evenly from Region 1 (none) to Region 8 (D-450: NPC decks fully upgraded there; D-406:
  // encounter decks "more developed"); an upgraded card is refined to that share of its line, its adjective with the same chance
  progression: { npc: 1, deck: 0.5 },
  // the hideout (D-418, D-739, D-740): Goldbars from the run's score, civilisation unlocks, the capture-quality upgrade. PLACEHOLDERS
  hideout: { goldbarsPerPoint: 0.1, unlockPrice: 60, capture: { step: 0.05, prices: [40, 80, 120] } },
  expeditedChance: 0.25,                   // Expedited Inspection's "may": 25 % at submission (your ruling, D-946)
  inflationPerRegion: 0.05,                 // D-658's price rise by map: +5 % per region passed (your placeholder, D-940)
  castle: { base: 1, up: 1.5, down: 0.5, king: 2 },   // the Royal Castle's purchase: x card value, by its suit tastes and the King's (D-433)
  finalInspection: { thresholdDrop: 3 },   // the Royal Castle's suspicion thresholds sit this much lower (8+ / 13+) ("the harshest", D-432)
  smuggle: { base: 1, perCell: 0.01 },     // a Fence pays x card value (2x the Market's sale price, D-417's initial proposal) +1 % per world cell from its origin
  scoreWeights: {},                         // D-416's six components, weight 1 each until balancing (PRG-01)
  rumourTrue: 0.7,                         // a tavern rumour's chance to be true (D-435: true ones recur more often; no number given)
  merc: { hire: 60, packages: [30, 45, 70], resale: 0.5, roadDiscount: 0.7, shopMarkup: 2.5, checkpointShopMarkup: 3 },   // MER-03; the Profiteer's markups (deferred): above market (2x), below the Checkpoint Trader (4x)   // mercenary hire, the three upgrade packages, resale share (MER-03: prices at balancing)                  // share of principal accrued as dividends each round (D-659 per round; rate held by D-672)
  fence: { binSize: 3, binPrice: 12, valuableChance: 0.1, upgradedChance: 0.15, stock: 2, xChance: 0.25 },   // SET-07: bins, odds, stock (balance values)                           // the Forestfolk toll on a refused challenge (D-412: "demand a toll", amount not given)                  // how many cargo cards an inspection of another caravan reveals (D-396: "a random selection")
  armourSupply: 1,                         // Armour Supply's military per Thick Forestfolk VIII in cargo (zold.md: "Amount TBD")
  roadDefence: 1,                          // Road Defence's military per Hardy Forager / Trapper, road encounters only ("Amount TBD")
  packLeader: 0.5,                         // Pack Leader's military per Beasts card in cargo ("Amount TBD")
  gamekeeper: 2,                           // Gamekeeper's coins per off-highway road ("Amount TBD")                         // Beast Defence's military against Beasts (townsfolk-rural.md: deferred to balancing, D-628)                    // Marching Formation's road-encounter military bonus (royal.md: TBD)
  ransom: 3,                               // Ransom coins per Aspiring Squire for a won road fight (royal.md: TBD)
  oracleSuspicion: 2,
  goldenFleeceSuspicion: 2,                // the Golden-Fleeced Lamb's own suspicion (makk.md "highly suspicious"; value TBD; D-1204)                      // the Oracle's "high inherent suspicion" (D-653: value TBD)
  stickyBundleSuspicion: 3,                // Sticky Fleece: "substantial additional suspicion" per Silken bundle (SUS-05: a value)
  qualityTier: 2,                          // Quality Improvement: value added per tier (V8-01: the tier values aren't built)
  cheapLabour: 0.2,                         // Cheap Labour: Guild refinement discount (tok.md gives no amount)
  exactCopyChance: 0.5,                    // PLACEHOLDER: D-662 quality roll, chance TBD
  routineInspectionChance: 0.5,            // PLACEHOLDER: CHK-15 open
  guardBribe: 3,                           // PLACEHOLDER: CHK-15 open ("relatively small bribe", D-135)
  secondInspectionSizes: [2, 3, 4, 5],
  townMinorCheckpoint: 0.15,
  briberyMilitary: [1, 2, 3],             // PLACEHOLDER: military (in Sevens) a Bribery allocation buys at a checkpoint, by stage (tok.md; D-1203)
  wagonUpgrade: { slots: 8, prices: [30, 60], max: 2 },   // PLACEHOLDER: Magistrates wagon capacity (D-394, D-553 "8 unlocked", D-1200)
  travellingSuit: 0.2,                   // PLACEHOLDER: an encounter point's people include a travelling suit (D-750, D-1199)
  fairChance: 0.15,                      // PLACEHOLDER: a settlement match on fair day, Carnivalfolk in the deck (D-749, D-1199)
  regionalScarcity: 0.25,                // PLACEHOLDER: sale premium for a commodity whose suit lives nowhere in the region (D-417, D-423, D-1195)
  scriptoriaParchment: 1,                // PLACEHOLDER: Parchment per Hides (D-568: 1 or 2, open until commodity values exist)
  parchmenterChance: 0.5,                 // PLACEHOLDER: a Clergy Alsó in a deck with Clergy and Forestfolk is the Parchmenter (D-568 placement intent, D-1192)
  cpEncounter: { chance: 0.3, carnival: 0.5 },   // PLACEHOLDER: an encounter at the checkpoint on arrival, and the share that is the travelling Carnival (D-407 (2), D-1191)
  corruption: { glitchPlace: 0.03, fenceChance: 0.12, glitchSale: 2, cardSale: 3, identify: 10, identifyStep: 1.5, lottery: [5, 15, 40], paratroopers: 1 },   // PLACEHOLDER (D-751, D-764, D-1186)
  reportedSuspicion: 3,                  // PLACEHOLDER: suspicion for the rest of the region after a King's Men caravan reports you (D-412, D-1185)
  greetingRumour: 0.3,                   // PLACEHOLDER: chance a settlement greeting carries a rumour about the King's tastes (D-435, D-1182)             // PLACEHOLDER: chance of a minor checkpoint at a town or city gate on arrival (D-456, D-1180)     // PLACEHOLDER: CHK-17 open (fewer, same or more than the first)
  trickLimit: 6,                           // PLACEHOLDER: D-172 POI/ordinary limit "about 5–6" (checkpoint ~8); exact value at balancing
  // POI rewards (D-725 directions; D-705 for resource sites): chance that a commodity slot in the POI's encounter deck holds a
  // valuable stage / an upgraded stage. PLACEHOLDERS. Settlements: none (ordinary locations). Bandit-overrun village
  // (monetary loot), active mine, military camp and monastery are not in Region 1's map and not set here.
  poiRewards: {
    "cave":            { valuable: 0.5 },                     // elevated chance of valuable cards (a hidden cave would be higher)
    "abandoned ruins": { upgraded: 0.4, valuable: 0.3 },      // treasure-oriented: rare or upgraded commodities and valuables
    "abandoned mine":  { valuable: 0.3, upgraded: 0.15 },     // commodities and scavenged valuables, roughly equal emphasis
    "active mine":     {},                                    // a working, resource-producing site: its character is the mineral lean
    "bandit-overrun village": { tagLean: { chance: 0.5, tags: ["valuable", "illicit"] } },   // D-725: monetary loot (coin goods, valuables)
    "military camp":   { tagLean: { chance: 0.5, tags: ["military"] } },  // D-725: royal military presence (King's Men)
    "monastery":       { upgraded: 0.25, valuable: 0.2, aszUpgraded: 0.3 }, // D-725: possible upgraded valuables, commodities or Ász
    // hidden resource sites (D-705, D-725): a higher chance of valuable commodities and already-upgraded cards than their visible kind;
    // PLACEHOLDERS (D-1187)
    "hidden cave":           { valuable: 0.65, upgraded: 0.15 },
    "hidden abandoned mine": { valuable: 0.45, upgraded: 0.3 },
    "hidden active mine":    { valuable: 0.2, upgraded: 0.2 },
  },
  // POI negotiation terms (D-263: "no prices, percentages or exchange rates are set"): PLACEHOLDERS
  negotiation: { cardPriceMult: 1.5, upFront: 4, profitShare: 0.25, seconds: 4.5, greedy: 0.15 },   // 4-5 s window (D-263)
  // Mines lean to their minerals (D-643 "mines raise odds", D-759 ore or salt): chance a Hillfolk commodity slot holds one
  mineLean: {
    ore:  { VIII: { chance: 0.8, names: ["Ore", "Copper Ore"] }, X: { chance: 0.6, names: ["Silver Ore", "Gold Ore"] } },
    salt: { VIII: { chance: 0.8, names: ["Rock Salt"] } },
  },
  patronageCoinsPerFace: 1,                // PLACEHOLDER: Patronage per Clergy face card in cargo, per town visit ("formula TBD")
  sacredTeachingsBonus: 1,                 // PLACEHOLDER: Sacred Teachings adds this per Revered X (+1 per refinement stage) to Patronage ("values TBD")
  studServiceCoins: 2,                     // PLACEHOLDER: Stud Service income per village stop, per Prize Cattle (Champion: double); "amount TBD"
  spectacleCoins: { base: 2, golden: 4 },  // PLACEHOLDER: Travelling Spectacle income per settlement; "a Golden-Fleeced Lamb generates more"
  fieldResearchXChance: 0.01,              // makk.md: "rarely (~1 %)" a Farmfolk X instead of an upgraded VIII
  churchAttrition: 6,                      // PLACEHOLDER: the Church's price for one Attrition upgrade (SET-02 open, D-870)
  // Checkpoint Trader (D-376: every checkpoint, stock and prices deferred to balancing; D-121: a last resort that buys at a
  // massive discount and sells at a massive markup, not stocked from the requirements). All PLACEHOLDERS
  checkpointTrader: { stock: 4, sellMult: 4, buyMult: 0.25 },   // market: buy 2x, sell 0.5x (D-675)
  // ---- road encounters (D-678 B4, D-796 to D-815): every number here is a PLACEHOLDER (balancing); rules are in encounters.js
  enc: {
    peddlerStock: 2,                       // RULED, not a placeholder: D-678 B4 "two random base commodities"
    peddlerOutsideChance: 0.2,             // "occasionally unusual commodities from outside the region" (D-796)
    treasureWeights: { coins: 0.6, commodity: 0.3, upgraded: 0.1 },   // D-804: coins likeliest, upgraded rarest
    treasureCoinsPerStop: 2,               // D-804: value scales with the stop's fixed number
    treasureStopsPerGood: 4,               // D-804: one more commodity every 4 stops (PLACEHOLDER; D-1225)
    treasureStopsPerStage: 6,              // D-804: one refinement stage more every 6 stops, up to the line's last (PLACEHOLDER; D-1225)
    travellerReward: { coinsChance: 0.5, coins: 5 },                    // D-798: money or a random card
    brokenDownMoney: 5,                    // D-796: "contribute money" (amount at balancing)
    innMarkup: 1.1, innDiscount: 0.8, innStock: 2,                      // D-807, D-811: slight markup / below settlement prices
    patrolStock: 2,                        // D-803 (b): standard military commodities for sale
    tollAmount: 5,                         // D-801 (10): the toll is open
    hostileMilitary: { Bandits: 2, Beasts: 2, "King's Men": 2 },   // deserters and the minor checkpoint are King's Men too (D-882)       // Bandits 2 is D-800 (provisional); Beasts, toll collectors open
    hostilePoolSize: 16,                   // D-801: the pool's size is open; exposure is floor(pool / 4) + difference (D-174)
    poolGroupMix: "equal",                 // D-814: "mix between the groups at balancing"
    exposeSeconds: 4.5,                    // D-177: one countdown of 4-5 s (provisional)
    ratioStrong: 1.5,                      // D-880: "nearly double" read as 1.5x (provisional); more than 2x doubles the weaker side
  },
};

export const RANKS = ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"];
export const SZARAZ = new Set(["VII", "VIII", "IX", "Alsó", "Felső", "Király"]);   // dry cards: not X or Ász
export const SUITS = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk"];           // PLACEHOLDER starting suits
export const ALL_SUITS = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Beasts", "Bandits", "Townsfolk", "King's Men",
  "Hillfolk", "Carnivalfolk", "Fisherfolk", "Plainsfolk"];                          // the twelve (D-411)

// Starting decks (D-162, D-163): the chosen civilisation's complete 8-card set VII–Ász as cargo, and a second complete set
// as the personal deck, whose IX is fully upgraded. Civilisation choice (D-161) isn't in Milestone A: Farmfolk is used.
export const CIVILISATION = "Farmfolk";
export function startingCargo(civ = CIVILISATION) { return RANKS.map((rank) => ({ rank, suit: civ })); }
export function startingPersonal(civ = CIVILISATION, ix = null) {
  // another civilisation (the AI caravans, D-410): its own IX, fully upgraded from its catalogue entry (D-163, D-619)
  if (civ !== CIVILISATION) return RANKS.map((rank) => ({ rank, suit: civ, ...(rank === "IX" && ix ? { refined: 1, adjective: ix.adjective, name: `${ix.adjective} ${ix.stages[1]}`, note: "fully upgraded" } : {}) }));
  // D-619 (6): the starting IX is fully upgraded: refined (Farmer's Papers, both passives) and adjective (Unassuming, Trick Ability)
  return RANKS.map((rank) => ({ rank, suit: CIVILISATION, ...(rank === "IX" ? { refined: 1, adjective: "Unassuming", name: "Unassuming Farmer's Papers", note: "fully upgraded" } : {}) }));
}
