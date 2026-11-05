// Settlement upgrade services (D-112, D-113, D-302, D-620, D-645): a small documented subset of cards for the vertical slice.
// Two independent tracks per card (D-645): refinement (named stages, raises value, may grant abilities) and the adjective
// (one purchase, grants one ability, D-649, D-668). Where each is sold: refinement at the Guild (D-112, D-113); a IX's
// refinement and adjective both at the Magistrates (D-620); the Church sells Attrition only (D-302).
//
// PRICES are the DRAFT repricing catalogue (docs/design/valuation/draft-prices-*.csv, "draft" column; D-670 to D-672):
// not approved as final, Region 1 (map 1) so no progression index (D-658). Labelled DRAFT wherever shown.
//
// Hidden progression (D-676): the interface shows only the NEXT stage, its price and what that stage provides.

import { COMMODITY_STAGES } from "./commodity-data.js";

export const CATALOGUE = {
  // ---- alternative commodity lines (commodity-alternatives.md; D-487 deals them already). Keyed by suit, rank and LINE (the
  // base stage's name). Institutions by D-302 / D-390's remits (applied by Claude, D-897): Trick Abilities and production /
  // income / trade at the Guild; protection, suspicion, legal and checkpoint matters at the Magistrates. DRAFT prices.
  "Farmfolk VIII Millet": {
    stages: ["Millet", "Dried Millet", "Hulled Millet"], adjective: "Steadfast", alt: true,
    refine: { at: "Guild", prices: [6, 3], gives: ["Dried Millet: Stubborn Roots: if another commodity takes its claim, you get 2 coins (once per encounter).", "Hulled Millet: Stubborn Roots: another commodity can't take its claim (no coins)."] },
    adj: { at: "Guild", price: 1, gives: "Second Harvest: each time it's refined, 50% for a basic Millet in cargo." },
    source: "docs/cards/commodity-alternatives.md; D-559, D-560",
  },
  "Farmfolk VIII Grapes": {
    stages: ["Grapes", "Grape Must", "Barrelled Wine"], adjective: "Ripening", alt: true,
    refine: { at: "Guild", prices: [4, 3], gives: ["Grape Must: Fermentation: 25% that the next player's card is swapped for a random one from their hand (once per encounter).", "Barrelled Wine: Fermentation 50%."] },
    adj: { at: "Guild", price: [3, 2, 1], gives: "Natural Maturation: in cargo, each journey 50% to mature a stage (Barrelled Wine: 10% to become Townsfolk Bottled Wine)." },
    source: "docs/cards/commodity-alternatives.md; D-561, D-562",
  },
  "Farmfolk X Sweet Grapes": {
    stages: ["Sweet Grapes", "Noble Rot Harvest", "Authentic Aszú"], adjective: "Decadent", alt: true,
    refine: { at: "Guild", prices: [8, 39], gives: ["Noble Rot Harvest: Revulsion: the next card can't claim when the card to match is an X (once per encounter).", "Authentic Aszú: Indulgence: the next card of your side claims, whatever it is (once per encounter)."] },
    adj: { at: "Guild", price: [3, 45, 9], gives: "Decadent, by stage: Premium Produce (+40% sold in a market town or town) / Noble Rot (spreads in cargo) / Liquid Diplomacy (personal deck: opens checkpoint bribes, 15% cheaper)." },
    source: "docs/cards/commodity-alternatives.md; D-563, D-564",
  },
  "Clergy VIII Parchment": {
    stages: ["Parchment", "Prepared Parchment", "Fine Vellum"], adjective: "Supple", alt: true,
    refine: { at: "Guild", prices: [3, 10], gives: ["Prepared Parchment: Written Protection: the Clergy claim it's played on can't be taken by the other side this round (once per encounter).", "Fine Vellum: also 3 coins for every attempt to take it."] },
    adj: { at: "Magistrates", price: 6, gives: "Making a List: in your personal deck, keeps one random cargo card safe in each ambush." },
    source: "docs/cards/commodity-alternatives.md; D-570 to D-573",
  },
  "Plainsfolk VIII Plains Pig": {
    stages: ["Plains Pig", "Pork", "Kolbász"], adjective: "Savoury", alt: true,
    refine: { at: "Guild", prices: [5, 15], gives: ["Pork: 1 coin when it takes a claim (once per encounter); Savoury: Plainsfolk goods sell 2% dearer.", "Kolbász: when played, refines a random Alsó in the trick for good; Savoury: +4%. Refining Pork into Kolbász: 5% for a secret extra."] },
    adj: { at: "Guild", price: [34, 1, 1], gives: "Savoury, by stage (personal deck): Snuffling (each journey 50% Mushrooms, 2% Truffles) / Plainsfolk goods sell +2% / +4%." },
    source: "docs/cards/commodity-alternatives.md; D-594, D-595",
  },
  "Plainsfolk X Wild Horse": {
    stages: ["Wild Horse", "Plains Horse", "Courser"], adjective: "Swift", alt: true,
    refine: { at: "Guild", prices: [16, 31], gives: ["Plains Horse: when played, encounter cards fill the trick up to ten, beneath it (not played; once per encounter).", "Courser: the card directly beneath may claim for you."] },
    adj: { at: "Magistrates", price: 2, gives: "Swift: in your personal deck, a hostile road encounter is rerolled at 50%; otherwise a chance per Plainsfolk card in cargo to avoid it (Plains Horse, Courser)." },
    source: "docs/cards/commodity-alternatives.md; D-599, D-600",
  },
  "Carnivalfolk VIII Bone Dice": {
    stages: ["Bone Dice", "Engraved Dice", "Loaded Dice"], adjective: "Dodgy", alt: true,
    refine: { at: "Guild", prices: [4, 3], gives: ["Engraved Dice: Weighted Odds: for the rest of the trick, card effects' random picks lean 5% towards your side's claim.", "Loaded Dice: 10%."] },
    adj: { at: "Guild", price: 2, gives: "Crooked: in your personal deck, +3 / +6 / +10 points on good overworld rolls, but all bonuses on a roll together stop at +10." },
    source: "docs/cards/commodity-alternatives.md; D-601, D-602, D-661",
  },
  "Carnivalfolk X Koboz": {
    stages: ["Koboz", "Lute", "Harp"], adjective: "Enchanting", alt: true,
    refine: { at: "Guild", prices: [11, 10], gives: ["Lute: Calling the Dance: the encounter deck's Alsó, Felső and Király go to its top (once per encounter).", "Harp: Ász too."] },
    adj: { at: "Guild", price: [6, 9, 16], gives: "Enchanting: in your personal deck, arriving at a settlement, 50% for a local face card in cargo (Koboz Alsó; Lute up to Felső; Harp up to Király, plus 1% for an Ász)." },
    source: "docs/cards/commodity-alternatives.md; D-603, D-604, D-605",
  },
  "King's Men VIII Broken Weapons": {
    stages: ["Broken Weapons", "Salvaged Weapons", "Surplus Arms"], adjective: "Battle-Worn", alt: true,
    refine: { at: "Guild", prices: [7, 8], gives: ["Salvaged Weapons: To Arms!: your side's next face card claims like a Conscript (once per encounter).", "Surplus Arms: your side's next card, any rank."] },
    adj: { at: "Magistrates", price: [6, 3, 3], gives: "Battle-Worn, by stage: Scrap Pile (1.5x concealment) / Country Buyers (150% sold in a village) / Armed Cargo (1 military and 1 military suspicion, at most 1 in total)." },
    source: "docs/cards/commodity-alternatives.md; D-630 to D-632, D-640, D-656",
  },
  "King's Men X Saltpetre": {
    stages: ["Saltpetre", "Black Powder", "Powder Keg"], adjective: "Volatile", alt: true,
    refine: { at: "Guild", prices: [7, 10], gives: ["Black Powder: Detonation: 33% per road fight or checkpoint Fight that the run ends (cargo or personal deck).", "Powder Keg: 66%."] },
    adj: { at: "Guild", price: [4, 4, 9], gives: "Chain Reaction: your side's next card's play ability fires twice (Black Powder: every later card; Powder Keg: also replays those already in the trick)." },
    source: "docs/cards/commodity-alternatives.md; D-633 to D-635",
  },
  "Bandits VIII Clipped Coins": {
    stages: ["Clipped Coins", "Coin Blanks", "Counterfeit Coins"], adjective: "Spurious", alt: true,
    refine: { at: "Guild", prices: [7, 8], gives: ["Coin Blanks: Cheap Imitation: becomes a basic copy of the card beneath for the trick (once per encounter).", "Counterfeit Coins: an exact copy of the card to match."] },
    adj: { at: "Guild", price: [17, 33, 49], gives: "Funny Money: in your personal deck, purchases and services 4% / 8% / 12% cheaper by stage." },
    source: "docs/cards/commodity-alternatives.md; D-636, D-637",
  },
  "Bandits X Concealed Dagger": {
    stages: ["Concealed Dagger", "Poisoned Blade", "Assassination Tools"], adjective: "Sinister", alt: true,
    refine: { at: "Guild", prices: [8, 62], gives: ["Poisoned Blade: Silence: played directly on a card, ends its ongoing ability (once per encounter).", "Assassination Tools: also can't be targeted by abilities."] },
    adj: { at: "Magistrates", price: [3, 6, 6], gives: "Cloak and Dagger: counts as a Seven for military (military suspicion 1 / 0 / 0 by stage); Assassination Tools: at each checkpoint, 5% that the guards ask for one card fewer." },
    source: "docs/cards/commodity-alternatives.md; D-638, D-641, D-657",
  },
  // ---- the rural Tradesfolk roster (tok-rural.md; D-530 to D-555; dealt in villages and market towns, D-530, D-554). Keyed
  // "<suit> <rank> (rural)". Institutions by D-302 / D-390 (applied by Claude, D-900); the IX at the Magistrates (D-620)
  "Tradesfolk VII (rural)": {
    stages: ["Spearman", "Caravan Guard"], adjective: "Local", alt: true,
    refine: { at: "Guild", prices: [9], gives: ["Caravan Guard: Ward Off: the opposing card played third above it can't claim (once per encounter)."] },
    adj: { at: "Magistrates", price: 1, gives: "Familiar Roads: counts as 1.5 Sevens of military against Bandits and Beasts (cargo or personal deck)." },
    source: "docs/cards/tok-rural.md; D-541 to D-543, D-744",
  },
  "Tradesfolk VIII (rural)": {
    stages: ["Ironware", "Cutlery", "Tools"], adjective: "Essential", alt: true,
    refine: { at: "Guild", prices: [14, 30], gives: ["Cutlery: Spillage: a basic Ironware is inserted somewhere in the trick (once per encounter).", "Tools: an exact copy of itself."] },
    adj: { at: "Guild", price: [3, 5, 7], gives: "Absolutely Essential: sold from cargo in a village or market town, twice its value." },
    source: "docs/cards/tok-rural.md; D-544",
  },
  "Tradesfolk IX (rural)": {
    stages: ["Travel Pass (Rural)", "Chapman's Papers"], adjective: "Resourceful", alt: true,
    refine: { at: "Magistrates", prices: [12], gives: ["Smuggling Expert: X and Ász raise half their suspicion. Trading Up: each settlement visit, 50% that a cargo commodity is swapped for a more valuable one of the same rank, stage and upgrade level, from a local suit. (Personal deck.)"] },
    adj: { at: "Magistrates", price: [24, 70], gives: "Trade Opportunities: when played, a basic VIII for your cargo (Chapman's Papers: one per suit in the trick; once per encounter)." },
    source: "docs/cards/tok-rural.md; D-545 to D-548, D-620",
  },
  "Tradesfolk X (rural)": {
    stages: ["Chest", "Painted Chest", "Bridal Chest"], adjective: "Surprising", alt: true,
    refine: { at: "Guild", prices: [8, 13], gives: ["Painted Chest: Opening the Dowry: becomes a random X for the trick (once per encounter).", "Bridal Chest: and works that X's trick ability."] },
    adj: { at: "Guild", price: [20, 30, 40], gives: "Dowry: each journey 10% / 15% / 20% for a random X in cargo (cargo or personal deck)." },
    source: "docs/cards/tok-rural.md; D-549, D-550",
  },
  "Tradesfolk Alsó (rural)": {
    stages: ["Porter", "Merchant's Apprentice"], adjective: "Hardworking", alt: true,
    refine: { at: "Guild", prices: [2], gives: ["Merchant's Apprentice: Learning the Trade: works a random Felső's trick ability from the encounter's suits (once per encounter)."] },
    adj: { at: "Guild", price: [6, 12], gives: "Odd Jobs: in your personal deck, 50% for 1 coin (Apprentice 2) at each settlement." },
    source: "docs/cards/tok-rural.md; D-532 to D-534",
  },
  "Tradesfolk Felső (rural)": {
    stages: ["Peddler", "Travelling Merchant"], adjective: "Crafty", alt: true,
    refine: { at: "Guild", prices: [20], gives: ["Travelling Merchant: Discount: 20% off base VIII and X goods (not Tradesfolk) from markets and peddlers (personal deck)."] },
    adj: { at: "Guild", price: 1, gives: "Haggling: a non-point card played directly on it may drop one rank for the trick (25%; Travelling Merchant 50%; once per encounter)." },
    source: "docs/cards/tok-rural.md; D-535 to D-537",
  },
  "Tradesfolk Király (rural)": {
    stages: ["Mercer", "Court Merchant"], adjective: "Haughty", alt: true,
    refine: { at: "Guild", prices: [11], gives: ["Court Merchant: Claim Suppression: cards beneath worth less lose their claims; it takes the claim if none is left; 1 coin per claim cut (once per encounter)."] },
    adj: { at: "Guild", price: 15, gives: "Luxury Trade: in your personal deck, fully refined VIII and X goods sell 30% dearer." },
    source: "docs/cards/tok-rural.md; D-538 to D-540, D-650",
  },
  "Tradesfolk Ász (rural)": {
    stages: ["Cart", "Covered Wagon", "Kocsi"], adjective: "Wandering", alt: true,
    refine: { at: "Guild", prices: [9, 14], gives: ["Covered Wagon: The Peddler's Here!: the last player swaps their card for a higher one from their hand (once per encounter).", "Kocsi: all three other players."] },
    adj: { at: "Guild", price: 49, gives: "Wandering, cumulative (personal deck): +8 cargo slots; Covered Wagon also sells 10% dearer; Kocsi also buys 10% cheaper." },
    source: "docs/cards/tok-rural.md; D-551 to D-555",
  },
  // ---- the rural Townsfolk roster (townsfolk-rural.md; D-606 to D-628; dealt as rural Tradesfolk, D-901). Institutions by
  // D-302 / D-390 (applied by Claude, D-902); the IX at the Magistrates (D-620)
  "Townsfolk VII (rural)": {
    stages: ["Volunteer", "Bellman"], adjective: "Unpredictable", alt: true,
    refine: { at: "Guild", prices: [6], gives: ["Bellman: Raise the Alarm: 50% for a Volunteer in your hand, gone at the trick's end if unplayed (once per encounter)."] },
    adj: { at: "Magistrates", price: 1, gives: "Untrained: in an ambush its military is rolled: 0 / 1 / 2 (Volunteer 40 / 50 / 10%, Bellman 35 / 50 / 15%)." },
    source: "docs/cards/townsfolk-rural.md; D-613, D-614",
  },
  "Townsfolk VIII (rural)": {
    stages: ["Bolted Flour", "Bread Dough", "Bread"], adjective: "Hearty", alt: true,
    refine: { at: "Guild", prices: [4, 4], gives: ["Bread Dough: Sticky Dough: played on the card to match, it becomes the card to match.", "Bread: keeps Sticky Dough; Rising: an Alsó, Felső or Király played on it may refine for the trick (50%)."] },
    adj: { at: "Guild", price: [1, 1, 7], gives: "Premium Sale: Bread sells for 200% (inactive until Bread)." },
    source: "docs/cards/townsfolk-rural.md; D-617, D-618, D-654",
  },
  "Townsfolk IX (rural)": {
    stages: ["Travel Pass (Rural)", "Leave Permit"], adjective: "Unremarkable", alt: true,
    refine: { at: "Magistrates", prices: [24], gives: ["Market Privileges: basic VIII goods 10% cheaper. Plain Goods: basic goods in cargo hide 1.5x better. (Personal deck.)"] },
    adj: { at: "Magistrates", price: 10, gives: "Market Run: played on a VIII good, a basic copy of it for your cargo (once per encounter)." },
    source: "docs/cards/townsfolk-rural.md; D-621, D-622, D-619",
  },
  "Townsfolk X (rural)": {
    stages: ["Grooved Millstone", "Stitched Millstone", "Millstone Pair"], adjective: "Heavy", alt: true,
    refine: { at: "Guild", prices: [28, 52], gives: ["Stitched Millstone: Grist: arriving at a settlement, a random basic Plainsfolk, Farmfolk, Townsfolk or Beasts VIII in cargo, 50% to refine.", "Millstone Pair: every such good, 50% each."] },
    adj: { at: "Guild", price: [4, 4, 9], gives: "Dead Weight: cards beneath it can't be moved or changed by abilities (Grooved: the one beneath; Stitched: all beneath; Pair: the whole trick)." },
    source: "docs/cards/townsfolk-rural.md; D-624, D-625, D-627",
  },
  "Townsfolk Alsó (rural)": {
    stages: ["Herb Gatherer", "Herbalist"], adjective: "Tireless", alt: true,
    refine: { at: "Guild", prices: [2], gives: ["Herbalist: Remedy: undoes a temporary change on one of your side's cards in the trick (once per encounter)."] },
    adj: { at: "Guild", price: [30, 62], gives: "Gathering Hike: in your personal deck, each journey 50% Mushrooms (Herbalist: also 50% Medicinal Herbs, 1% Chamomile)." },
    source: "docs/cards/townsfolk-rural.md; D-607, D-608",
  },
  "Townsfolk Felső (rural)": {
    stages: ["Mill Hand", "Miller"], adjective: "Gruelling", alt: true,
    refine: { at: "Guild", prices: [13], gives: ["Miller: Grinding: a card played on him loses a refinement stage for the trick, and a Wheat appears beneath him."] },
    adj: { at: "Guild", price: 1, gives: "Milling: in your personal deck, each journey 50% to mill a Farmfolk Flour (Miller: Wheat) in cargo into Bolted Flour." },
    source: "docs/cards/townsfolk-rural.md; D-609 to D-611",
  },
  "Townsfolk Király (rural)": {
    stages: ["Sworn Councillor", "Village Judge"], adjective: "Judicious", alt: true,
    refine: { at: "Magistrates", prices: [28], gives: ["Village Judge: Tax Collection: in your personal deck, 2 coins arriving at a village, 4 at a market town."] },
    adj: { at: "Guild", price: 1, gives: "Arbitration: Councillor prevents your side losing a claim to an ability once; the Judge restores one lost that way (once per encounter)." },
    source: "docs/cards/townsfolk-rural.md; D-612, D-615, D-616, D-623",
  },
  "Townsfolk Ász (rural)": {
    stages: ["Shepherd", "Proud Shepherd", "Star-Eyed Shepherd"], adjective: "Indomitable", alt: true,
    refine: { at: "Guild", prices: [9, 16], gives: ["Proud Shepherd: Defiance: Király abilities lose their power for the trick; Beast Defence (personal deck) [provisional amount].", "Star-Eyed Shepherd: Mesmerise: the next opposing attempt on your side's claim fails; returns if confiscated in a checkpoint fight."] },
    adj: { at: "Magistrates", price: 4, gives: "Routine Check Prevention: in your personal deck, no routine inspection at the checkpoint." },
    source: "docs/cards/townsfolk-rural.md; D-626 to D-628",
  },
  // ---- the agricultural Beasts roster (beasts-agricultural.md; D-484 to D-523, D-655, D-656). Institutions as the card file applies
  // D-302 (Guild: trick abilities, production, refinement, commerce; Magistrates: road encounters, travel); the IX at the Magistrates (D-620)
  "Beasts VII (agricultural)": {
    stages: ["Locust Swarm", "Plague"], adjective: "Devouring", alt: true,
    refine: { at: "Guild", prices: [86], gives: ["Plague: Devour: the two cards directly beneath it go straight to you (once per encounter)."] },
    adj: { at: "Magistrates", price: 1, gives: "Infestation: in an ambush, an exposed opposing VIII becomes a Locust Swarm (needs persistent opposing caravans)." },
    source: "docs/cards/beasts-agricultural.md; D-500, D-501, D-655",
  },
  "Beasts VIII (agricultural)": {
    stages: ["Feathers", "Down", "Feather Bedding"], adjective: "Sleepy", alt: true,
    refine: { at: "Guild", prices: [3, 4], gives: ["Down: sells for +3 / 8 / 13 / 18 % by settlement tier.", "Feather Bedding: +5 / 10 / 15 / 20 %."] },
    adj: { at: "Guild", price: 4, gives: "Sleepy: the card played directly on it can't use its trick ability (once per encounter)." },
    source: "docs/cards/beasts-agricultural.md; D-502, D-503, D-656",
  },
  "Beasts IX (agricultural)": {
    stages: ["Travel Papers (Agricultural)", "Chewed Leaf"], adjective: "Innocuous", alt: true,
    refine: { at: "Magistrates", prices: [27], gives: ["Chewed Leaf: Crop Raiding (off the highway, 50% for a Farmfolk, Plainsfolk or Forestfolk VIII) and Innocuous Cargo (VIII cargo hides 1.5x better). (Personal deck.)"] },
    adj: { at: "Magistrates", price: [1, 9], gives: "Disconcerting: the other side's Farmfolk can't claim this trick (Chewed Leaf: also Plainsfolk and Forestfolk, and each lost claim pays a VIII)." },
    source: "docs/cards/beasts-agricultural.md; D-504 to D-512, D-656",
  },
  "Beasts X (agricultural)": {
    stages: ["Chamomile", "Dried Chamomile", "Herbal Tea"], adjective: "Soothing", alt: true,
    refine: { at: "Guild", prices: [8, 10], gives: ["Dried Chamomile: Infusion: a copy of a random Beasts card played earlier in the encounter, above it, for the trick.", "Herbal Tea: of the most recent one."] },
    adj: { at: "Magistrates", price: 1, gives: "Soothing: in your personal deck, refusing a duel brings no follow-up attack." },
    source: "docs/cards/beasts-agricultural.md; D-513 to D-516",
  },
  "Beasts Alsó (agricultural)": {
    stages: ["Fox", "Csalavér"], adjective: "Pilfering", alt: true,
    refine: { at: "Guild", prices: [19], gives: ["Csalavér: Poultry Theft (personal deck): 50% for Feathers at each settlement; with Pilfering, you're told where the stolen card returns."] },
    adj: { at: "Guild", price: 4, gives: "Pilfering: a random card leaves the trick and returns at its end, to its place or on top (once per encounter)." },
    source: "docs/cards/beasts-agricultural.md; D-490, D-491",
  },
  "Beasts Felső (agricultural)": {
    stages: ["Jackal", "Toportyán"], adjective: "Scavenging", alt: true,
    refine: { at: "Guild", prices: [32], gives: ["Toportyán: Pack Instinct: claims whatever the card to match, as a Conscript."] },
    adj: { at: "Guild", price: 24, gives: "Scavenging (personal deck): after a match that overfills the wagon, a roll may refine an unrefined VIII or X in cargo." },
    source: "docs/cards/beasts-agricultural.md; D-492 to D-494",
  },
  "Beasts Király (agricultural)": {
    stages: ["Badger", "Ebborz"], adjective: "Tenacious", alt: true,
    refine: { at: "Magistrates", prices: [43], gives: ["Ebborz: Tax Evasion (personal deck): no highway tolls or crossing fees; with Tenacious, the protection extends above later Beasts cards."] },
    adj: { at: "Guild", price: 4, gives: "Tenacious: a claim by ability made directly on top of it is blocked until another card covers it." },
    source: "docs/cards/beasts-agricultural.md; D-498, D-499",
  },
  "Beasts Ász (agricultural)": {
    stages: ["Bustard", "Great Bustard", "Túzok"], adjective: "Booming", alt: true,
    refine: { at: "Guild", prices: [12, 11], gives: ["Great Bustard: Lekking: claims as the rank of the card to match.", "Túzok: and the next player must play an Ász if able."] },
    adj: { at: "Magistrates", price: 1, gives: "Booming (personal deck): a non-combat road encounter may be rerolled (Bustard 75%, Great Bustard 50%, Túzok 25%)." },
    source: "docs/cards/beasts-agricultural.md; D-517 to D-522",
  },
  // ---- Forestfolk (zold.md; two-track D-650, D-651; institutions D-297, the IX at the Magistrates D-620) and its alternatives
  "Forestfolk VII": {
    stages: ["Poacher", "Ranger"], adjective: "Wily",
    refine: { at: "Guild", prices: [9], gives: ["Ranger: Disguise: when played, it counts as a Forestfolk Alsó for the trick."] },
    adj: { at: "Magistrates", price: 4, gives: "Tracking: shows other caravans off the highway (no other caravans in this build)." },
    source: "docs/cards/zold.md",
  },
  "Forestfolk VIII": {
    stages: ["Hides", "Cured Hides", "Leather"], adjective: "Thick",
    refine: { at: "Guild", prices: [4, 6], gives: ["Cured Hides: False Claim: played on a claimant that holds by ability, it cancels that claim.", "Leather: also a Seven's claim directly beneath it."] },
    adj: { at: "Magistrates", price: 3, gives: "Armour Supply: in cargo, extra military [provisional amount]." },
    source: "docs/cards/zold.md; D-243, D-270, D-651",
  },
  "Forestfolk IX": {
    stages: ["Travel Pass", "Forester's Papers"], adjective: "Woodswise",
    refine: { at: "Magistrates", prices: [81], gives: ["Forester's Papers: Foraging and Hunting (off the highway, 1-3 goods) and Concealed Arms (VII cargo half suspicion). (Personal deck.)"] },
    adj: { at: "Magistrates", price: 4, gives: "Lost in the Woods: hides the card to match and the claimant from everyone until the claim changes." },
    source: "docs/cards/zold.md; D-247, D-277, D-619",
  },
  "Forestfolk X": {
    stages: ["Truffles", "Black Truffles", "Royal Truffles"], adjective: "Alluring",
    refine: { at: "Magistrates", prices: [37, 40], gives: ["Black Truffles: Roadkill: in cargo, 50% per road for a Hides.", "Royal Truffles: every road."] },
    adj: { at: "Guild", price: 1, gives: "Alluring Scent: 50% a Tusker joins the trick and rampages; if it wins, the trick is lost to everyone." },
    source: "docs/cards/zold.md; D-187, D-211, D-308, D-651",
  },
  "Forestfolk Alsó": {
    stages: ["Forager", "Trapper"], adjective: "Hardy",
    refine: { at: "Guild", prices: [10], gives: ["Trapper: Set Trap: at the trick's end the top two cards swap."] },
    adj: { at: "Magistrates", price: 3, gives: "Road Defence: extra military in road encounters [provisional amount]." },
    source: "docs/cards/zold.md; D-650",
  },
  "Forestfolk Felső": {
    stages: ["Hunter", "Forester"], adjective: "Steady",
    refine: { at: "Guild", prices: [11], gives: ["Forester: Hunting Season: four encounter suits in the trick pay you 4 coins."] },
    adj: { at: "Magistrates", price: 1, gives: "Gamekeeper: in your personal deck, coins after each off-highway road [provisional amount]." },
    source: "docs/cards/zold.md; D-318, D-509",
  },
  "Forestfolk Király": {
    stages: ["Baron", "Huntmaster"], adjective: "Noble",
    refine: { at: "Guild", prices: [7], gives: ["Huntmaster: Hunting Orders: the card to match becomes a random Forestfolk card for the trick."] },
    adj: { at: "Magistrates", price: 8, gives: "Outlaw's Protection: in your personal deck, Forestfolk face cards in cargo hide 1.5x better." },
    source: "docs/cards/zold.md; D-209, D-650",
  },
  "Forestfolk Ász": {
    stages: ["Horn", "Hunting Horn", "Horn of Nimród"], adjective: "Commanding",
    refine: { at: "Guild", prices: [17, 32], gives: ["Hunting Horn: Wolf Summoning: an Alpha into your hand.", "Horn of Nimród: and another Alpha into the trick."] },
    adj: { at: "Magistrates", price: 3, gives: "Pack Leader: in your personal deck, each Beasts card in cargo adds military [provisional amount]." },
    source: "docs/cards/zold.md; D-528, D-650",
  },
  "Forestfolk VIII Willow Branches": {
    stages: ["Willow Branches", "Willow Withies", "Wicker Bundles"], adjective: "Entangling", alt: true,
    refine: { at: "Guild", prices: [7, 8], gives: ["Willow Withies: Entanglement: the card beneath can't be removed this trick.", "Wicker Bundles: neither card can be removed or moved."] },
    adj: { at: "Guild", price: 1, gives: "Bundling: when sold, 2 / 4 / 6% (by stage) to sell for double." },
    source: "docs/cards/commodity-alternatives.md; D-590, D-593",
  },
  "Forestfolk X Beaver Pelt": {
    stages: ["Beaver Pelt", "Cured Beaver Pelt", "Beaver Fur"], adjective: "Tempting", alt: true,
    refine: { at: "Guild", prices: [19, 19], gives: ["Cured Beaver Pelt: Tempting Trade (personal deck): where no Forestfolk live, refinement 10% and goods 2% cheaper.", "Beaver Fur: 15% and 5%."] },
    adj: { at: "Guild", price: [1, 1, 4], gives: "Tempting: later claims this trick may go for the Beaver instead: 10 / 25 / 50% (by stage)." },
    source: "docs/cards/commodity-alternatives.md; D-591, D-593",
  },
  // ---- Hillfolk (hillfolk.md; two-track D-650, D-652, D-656; institutions as the card file's D-302 / D-390 lines, the IX D-620) and its
  // alternatives (Salt, Copper, Silver, Gold; D-580 to D-589, D-654; the Guild, applied by Claude)
  "Hillfolk Alsó": {
    stages: ["Miner", "Ore Seeker"], adjective: "Keen",
    refine: { at: "Guild", prices: [5], gives: ["Ore Seeker: Upheaval: a random card from beneath the top jumps to the top."] },
    adj: { at: "Magistrates", price: 30, gives: "Scrounging: in cargo, each other Hillfolk card in cargo adds 5% per road for a Hillfolk VIII." },
    source: "docs/cards/hillfolk.md; D-357, D-652",
  },
  "Hillfolk Felső": {
    stages: ["Blacksmith", "Steelmaker"], adjective: "Thrifty",
    refine: { at: "Guild", prices: [6], gives: ["Steelmaker: Outfitting: your next Hillfolk card claims as a Seven."] },
    adj: { at: "Guild", price: 3, gives: "Forge Discount: in your personal deck, refining Hillfolk VIII and X costs 30% less." },
    source: "docs/cards/hillfolk.md; D-650",
  },
  "Hillfolk Király": {
    stages: ["Magistrate", "Chamberlain"], adjective: "Affluent",
    refine: { at: "Guild", prices: [11], gives: ["Chamberlain: Jurisdiction: the last Hillfolk card beneath acts again, and you get 2 coins."] },
    adj: { at: "Magistrates", price: 40, gives: "Local Levy: in your personal deck, 10 coins at each settlement where Hillfolk live." },
    source: "docs/cards/hillfolk.md; D-390, D-652",
  },
  "Hillfolk VII": {
    stages: ["Crossbowman", "Arbalester"], adjective: "Vigilant",
    refine: { at: "Guild", prices: [9], gives: ["Arbalester: Covering Fire: the next time your Hillfolk card would lose its claim, it keeps it (once per encounter)."] },
    adj: { at: "Magistrates", price: 11, gives: "Hidden in Plain Sight: +3 concealment while you carry Hillfolk valuables (either deck)." },
    source: "docs/cards/hillfolk.md; D-368, D-652",
  },
  "Hillfolk VIII": {
    stages: ["Ore", "Iron", "Steel"], adjective: "Magnetic",
    refine: { at: "Magistrates", prices: [3, 3], gives: ["Iron: Magnetism: two Iron or Steel take one cargo slot.", "Steel: the same."] },
    adj: { at: "Guild", price: 4, gives: "Scrap Metal: played with your Hillfolk card already in the trick: 1 coin (once per encounter)." },
    source: "docs/cards/hillfolk.md; D-388, D-390",
  },
  "Hillfolk IX": {
    stages: ["Travel Pass", "Smith's Papers"], adjective: "Discerning",
    refine: { at: "Magistrates", prices: [11], gives: ["Smith's Papers: Resource Acquisition (50% a Hillfolk VIII where Hillfolk live) and Trade Privileges (Hillfolk VIII +10% where they don't). (Personal deck.)"] },
    adj: { at: "Magistrates", price: 4, gives: "Authentication: with a Hillfolk X in the same round, 30% for an exact copy of it in your cargo." },
    source: "docs/cards/hillfolk.md; D-619, D-620",
  },
  "Hillfolk X": {
    stages: ["Horseshoe", "Fine Horseshoe", "Masterwork Horseshoe"], adjective: "Lucky",
    refine: { at: "Guild", prices: [8, 13], gives: ["Fine Horseshoe: Final Nail: played on an X, the trick ends with this round.", "Masterwork Horseshoe: on a VII or an X."] },
    adj: { at: "Guild", price: [4, 11, 11], gives: "Good Fortune: in your personal deck, beneficial overworld chances +5 points (refined: +15)." },
    source: "docs/cards/hillfolk.md; D-378, D-656",
  },
  "Hillfolk Ász": {
    stages: ["Recluse", "Hermit", "Sage"], adjective: "Ascetic",
    refine: { at: "Guild", prices: [9, 11], gives: ["Hermit: Forewarning: if the trick goes on a round, your Hillfolk cards gather at the top after it.", "Sage: everyone's Hillfolk cards."] },
    adj: { at: "Guild", price: [6, 8, 11], gives: "Solitude: in your personal deck, services and bribes 10 / 15 / 20% cheaper (yours is the only caravan)." },
    source: "docs/cards/hillfolk.md; D-652",
  },
  "Hillfolk VIII Rock Salt": {
    stages: ["Rock Salt", "Crushed Salt", "Refined Salt"], adjective: "Preserving", alt: true,
    refine: { at: "Guild", prices: [4, 3], gives: ["Crushed Salt: Salting: an opposing good played on it that takes your claim becomes Rock Salt for the trick (after its ability).", "Refined Salt: before its ability, which doesn't trigger."] },
    adj: { at: "Guild", price: 1, gives: "Salt Cure: in cargo, nothing refines or changes goods automatically on the road or on arrival." },
    source: "docs/cards/commodity-alternatives.md; D-580 to D-582, D-654",
  },
  "Hillfolk VIII Copper Ore": {
    stages: ["Copper Ore", "Copper", "Copper Sheets"], adjective: "Malleable", alt: true,
    refine: { at: "Guild", prices: [4, 11], gives: ["Copper: Malleable: on a IX or X to match it becomes a Hillfolk IX or X for the trick.", "Copper Sheets: a Hillfolk VII, whatever the card to match."] },
    adj: { at: "Guild", price: 1, gives: "Tempering: in cargo, automatic refinement chances +5 points (Copper Sheets +10)." },
    source: "docs/cards/commodity-alternatives.md; D-584 to D-586, D-654",
  },
  "Hillfolk X Silver Ore": {
    stages: ["Silver Ore", "Refined Silver", "Silver Ingots"], adjective: "Circulating", alt: true,
    refine: { at: "Guild", prices: [7, 25], gives: ["Refined Silver: Let It Ride: the caller must play another round.", "Silver Ingots: and 1 coin per round of the trick."] },
    adj: { at: "Guild", price: [4, 12, 19], gives: "Seller's Market: in your personal deck, goods sell 2 / 6 / 10% higher (by stage)." },
    source: "docs/cards/commodity-alternatives.md; D-587 to D-589",
  },
  "Hillfolk X Gold Ore": {
    stages: ["Gold Ore", "Refined Gold", "Gold Ingots"], adjective: "Hoarded", alt: true,
    refine: { at: "Guild", prices: [7, 75], gives: ["Refined Gold: Cash Out: the trick ends with this round.", "Gold Ingots: and 10 coins less 1 per round of the trick."] },
    adj: { at: "Guild", price: [6, 18, 30], gives: "Buyer's Market: in your personal deck, goods cost 2 / 6 / 10% less (by stage)." },
    source: "docs/cards/commodity-alternatives.md; D-587 to D-589",
  },
  // ---- Fisherfolk (fisherfolk.md; two-track D-650, D-652, D-656; institutions as the card file's D-302 / D-390 lines, the IX D-620)
  // and its Reeds and Egret lines (D-576 to D-579; institutions applied by Claude by D-302's remits)
  "Fisherfolk Alsó": {
    stages: ["Reed Cutter", "Reed Thatcher"], adjective: "Scrappy",
    refine: { at: "Guild", prices: [6], gives: ["Reed Thatcher: Reed Trade: in your personal deck, Fisherfolk VIII and X sell +20% (two at most)."] },
    adj: { at: "Guild", price: 10, gives: "Reed Harvest: when played, 1 coin per dry card already in the trick (once per encounter)." },
    source: "docs/cards/fisherfolk.md",
  },
  "Fisherfolk Felső": {
    stages: ["Fisherman", "Sturgeon Fisherman"], adjective: "Patient",
    refine: { at: "Guild", prices: [79], gives: ["Sturgeon Fisherman: Big Catch: when played, 10 coins per X or Ász already in the trick."] },
    adj: { at: "Guild", price: 20, gives: "Fishing: in your personal deck, stopping where Fisherfolk live: a Fisherfolk VIII (wagon full: one refines)." },
    source: "docs/cards/fisherfolk.md; D-390",
  },
  "Fisherfolk Király": {
    stages: ["Helmsman", "Vajda"], adjective: "Canny",
    refine: { at: "Guild", prices: [7], gives: ["Vajda: Crew Command: your other Fisherfolk face cards in the trick claim whatever their rank."] },
    adj: { at: "Guild", price: 9, gives: "Networking: in your personal deck, Fisherfolk upgrades cost 20% less." },
    source: "docs/cards/fisherfolk.md; D-380, D-390",
  },
  "Fisherfolk VII": {
    stages: ["Spearfisher", "Harpooner"], adjective: "Calloused",
    refine: { at: "Guild", prices: [9], gives: ["Harpooner: Piercing Claim: its claim ignores abilities that would stop it."] },
    adj: { at: "Magistrates", price: 1, gives: "Wild Deterrent: in your personal deck, Beasts ambushes where Fisherfolk live are repelled (no spoils)." },
    source: "docs/cards/fisherfolk.md; D-626",
  },
  "Fisherfolk VIII": {
    stages: ["Loach", "Basket of Loaches", "Barrel of Loaches"], adjective: "Slippery",
    refine: { at: "Magistrates", prices: [8, 3], gives: ["Basket of Loaches: Fake Bottom: in cargo, 1.5x its base concealment.", "Barrel of Loaches: the same."] },
    adj: { at: "Guild", price: 1, gives: "Slippery: the first card on it may slip down the trick (30%)." },
    source: "docs/cards/fisherfolk.md; D-652",
  },
  "Fisherfolk IX": {
    stages: ["Travel Pass", "Fisherman's Papers"], adjective: "Fanciful",
    refine: { at: "Magistrates", prices: [5], gives: ["Fisherman's Papers: Expedited Inspection (checkpoint cargo requirements count as met) and Local Support (+1 military where Fisherfolk live). (Personal deck.)"] },
    adj: { at: "Magistrates", price: 5, gives: "I Once Caught a Bigger One!: 50% a Fisherfolk VIII in the trick becomes a Fisherfolk X." },
    source: "docs/cards/fisherfolk.md; D-619, D-656, D-742",
  },
  "Fisherfolk X": {
    stages: ["Sterlet", "Sturgeon", "Beluga Sturgeon"], adjective: "Voracious",
    refine: { at: "Guild", prices: [16, 10], gives: ["Sturgeon: Bottom Feeding: the two cards nearest the card to match leave for the round.", "Beluga Sturgeon: three."] },
    adj: { at: "Guild", price: 12, gives: "What a Catch!: in your personal deck, 50% at each settlement for a Fisherman in cargo." },
    source: "docs/cards/fisherfolk.md; D-650",
  },
  "Fisherfolk Ász": {
    stages: ["Fowler", "Bogman", "Pákász"], adjective: "Weatherwise",
    refine: { at: "Guild", prices: [9, 11], gives: ["Bogman: Borrowed Tricks: copies the ability of a card in the trick.", "Pákász: even one it hasn't unlocked."] },
    adj: { at: "Magistrates", price: 9, gives: "Waterways: in your personal deck, go by water to a Fisherfolk stop ahead that no road reaches; no tolls or fees." },
    source: "docs/cards/fisherfolk.md; D-366, D-374, D-420, D-480",
  },
  "Fisherfolk VIII Reeds": {
    stages: ["Reeds", "Reed Bundles", "Reed Mat"], adjective: "Woven", alt: true,
    refine: { at: "Magistrates", prices: [7, 3], gives: ["Reed Bundles: Privacy Screen: other caravans can't inspect your cargo (none in this build).", "Reed Mat: nor by abilities."] },
    adj: { at: "Guild", price: 4, gives: "Coverup: abilities aimed at the card to match hit this card instead." },
    source: "docs/cards/commodity-alternatives.md; D-576, D-577",
  },
  "Fisherfolk X Egret": {
    stages: ["Egret", "Egret Plumage", "Ornamental Plumage"], adjective: "Aristocratic", alt: true,
    refine: { at: "Guild", prices: [7, 50], gives: ["Egret Plumage: Ennoblement: the card to match is one rank higher for the trick.", "Ornamental Plumage: plus that rank's value in coins."] },
    adj: { at: "Magistrates", price: 40, gives: "Aristocratic: in your personal deck, no highway tolls; Plumage: no routine inspection; Ornamental: give it up to skip a checkpoint fight." },
    source: "docs/cards/commodity-alternatives.md; D-578, D-579",
  },
  "Clergy X Reliquary": {
    stages: ["Reliquary", "Consecrated Reliquary", "Saint's Reliquary"], adjective: "Hallowed", alt: true,
    refine: { at: "Guild", prices: [8, 10], gives: ["Consecrated Reliquary: Divine Manifestation: 50% to work a random Ász's trick ability, then revert (once per encounter).", "Saint's Reliquary: 75%, as the Ász's highest stage."] },
    adj: { at: "Guild", price: [2, 4, 7], gives: "Hallowed: sells at 200% of its value in a city with Clergy; Consecrated: 50% per journey for a Pilgrim; Saint's: also 2% for a Drifter (cargo or personal deck)." },
    source: "docs/cards/commodity-alternatives.md; D-574, D-575",
  },
  "Farmfolk IX": {
    stages: ["Travel Pass", "Farmer's Papers"], adjective: "Unassuming",
    refine: { at: "Magistrates", prices: [8], gives: ["Expanded Carrying Capacity: wagon capacity 40 while this card is in your personal deck (threshold effects don't stack). Agricultural Concealment: lowers suspicion for each Farmfolk card in cargo [placeholder amount]."] },
    adj: { at: "Magistrates", price: 26, gives: "Travelling Merchant: when played in a Zsír trick, 50% chance of a random Refinement I Rank VIII commodity for your cargo after the match." },
    source: "docs/cards/makk.md; D-245, D-619, D-620",
  },
  "Clergy IX": {
    stages: ["Travel Pass", "Pilgrim's Papers"], adjective: "Clerical",
    refine: { at: "Magistrates", prices: [44], gives: ["Highway Fee Exemption: no highway tolls while this card is in your personal deck. General Concealment: lowers suspicion [placeholder amount]."] },
    adj: { at: "Magistrates", price: 8, gives: "Collection Plate: when played in a Zsír trick, the side that wins that trick gets 1 coin per Clergy card in it." },
    source: "docs/cards/piros.md; D-246, D-619, D-620",
  },
  // ---- the Tradesfolk suit (urban main roster, tok.md; classification valuation/classification.csv; D-297, D-303, D-620; DRAFT prices)
  "Tradesfolk VII": {
    stages: ["Sellsword", "Enforcer"], adjective: "Imposing",
    refine: { at: "Guild", prices: [9], gives: ["Superior Equipment: the Enforcer's claim stops the first Seven played after it (a matching card still takes it)."] },
    adj: { at: "Magistrates", price: 2, gives: "Superior Military Equipment: counts as 1.5 Sevens of military, from cargo or the personal deck." },
    source: "docs/cards/tok.md; D-525, D-744",
  },
  "Tradesfolk VIII": {
    stages: ["Cloth", "Fine Cloth", "Brocade"], adjective: "Bulky",
    refine: { at: "Guild", prices: [7, 7], gives: ["Fine Cloth: worth more; Merchant's Cut: when played, if its side takes the trick, that trick's loot sells for 5% more.",
                                                  "Brocade: Merchant's Cut rises to 10%."] },
    adj: { at: "Magistrates", price: 6, gives: "Hidden Compartments: in cargo, this card lowers suspicion by 2 (200% of its base concealment)." },
    source: "docs/cards/tok.md; D-244, D-274, D-280, D-651",
  },
  "Tradesfolk IX": {
    stages: ["Travel Pass (Urban)", "Merchant's Papers"], adjective: "Enterprising",
    refine: { at: "Magistrates", prices: [77], gives: ["Trading Advantage: buy 15% cheaper and sell 15% dearer at markets, while in your personal deck. Professional Concealment: lowers suspicion for each Felső in cargo [placeholder amount]."] },
    adj: { at: "Magistrates", price: 1, gives: "Commodity Exchange: when played, 50% to turn every Rank VIII in the trick into another suit's good, for good." },
    source: "docs/cards/tok.md; D-248, D-275, D-619, D-620",
  },
  "Tradesfolk X": {
    stages: ["Amber", "Cabochon", "Amulet"], adjective: "Coveted",
    refine: { at: "Guild", prices: [46, 48], gives: ["Cabochon: worth more; Gilded Bait: when played, coins equal to its value go to the side that takes the trick.",
                                                   "Amulet: Gilded Bait pays twice its value."] },
    adj: { at: "Magistrates", price: 1, gives: "Bribery: in cargo, buys 10% / 20% / 30% concealment at the checkpoint for 4 / 6 / 8 coins (Amber / Cabochon / Amulet; two at most), and lets you bribe inspectors and requirements [provisional values]." },
    source: "docs/cards/tok.md; D-651",
  },
  "Tradesfolk Alsó": {
    stages: ["Apprentice", "Journeyman"], adjective: "Industrious",
    refine: { at: "Guild", prices: [6], gives: ["Apprenticeship: a trick with the Journeyman and two Felső gives you a Tradesfolk VIII (1%: an X)."] },
    adj: { at: "Guild", price: 1, gives: "Cheap Labour: while in your personal deck, refining at the Guild costs less." },
    source: "docs/cards/tok.md; D-386, D-650",
  },
  "Tradesfolk Felső": {
    stages: ["Craftsman", "Master"], adjective: "Diligent",
    refine: { at: "Guild", prices: [25], gives: ["Craftsmanship: in a trick with the Master, a non-Tradesfolk VIII becomes a Tradesfolk VIII (or a new one is made beneath the Master)."] },
    adj: { at: "Guild", price: 42, gives: "Master Craftsmanship: while in your personal deck, each settlement refines one Tradesfolk VIII in your cargo for free." },
    source: "docs/cards/tok.md; D-742",
  },
  "Tradesfolk Király": {
    stages: ["Guildmaster", "Magnate"], adjective: "Ruthless",
    refine: { at: "Guild", prices: [4], gives: ["Hostile Takeover: acts as a Seven when you're richer than every other caravan (not yet working: no other caravans in this build)."] },
    adj: { at: "Magistrates", price: 6, gives: "Hired Swords: while in your personal deck, +2 Sevens of military on the road and at checkpoints." },
    source: "docs/cards/tok.md",
  },
  "Tradesfolk Ász": {
    stages: ["Courtesan", "Favourite", "Royal Mistress"], adjective: "Enticing",
    refine: { at: "Guild", prices: [17, 11], gives: ["Favourite: Distraction: when played, the cards beneath her lose their lasting effects (protections, Lock, Authority).",
                                                   "Royal Mistress: Distraction also covers the card played directly on top of her."] },
    adj: { at: "Magistrates", price: 6, gives: "Special Treatment: while in your personal deck, tolls, crossings and upgrade costs are 5% cheaper (10% Favourite, 15% Royal Mistress)." },
    source: "docs/cards/tok.md; D-303, TRK-23",
  },
  // ---- the Plainsfolk suit (plainsfolk.md; tracks: valuation/classification.csv; DRAFT prices: valuation/draft-prices-*.csv)
  "Plainsfolk VII": {
    stages: ["Lawman", "Pandúr"], adjective: "Dogged",
    refine: { at: "Magistrates", prices: [15], gives: ["Confiscation: while in your personal deck, entering a Bandits location: 49% a Bandits VIII, 1% a Bandits X."] },
    adj: { at: "Guild", price: 1, gives: "Hot Pursuit: when a Bandits card is played above it, the Lawman rides to the top of the trick (a Pandúr also chases the Betyár)." },
    source: "docs/cards/plainsfolk.md; D-652, D-390",
  },
  "Plainsfolk VIII": {
    stages: ["Racka Sheep", "Wool", "Guba"], adjective: "Shaggy",
    refine: { at: "Guild", prices: [3, 7], gives: ["Wool: worth more.", "Guba: Insulation: shields your side's bottom card from the next card ability that would affect it."] },
    adj: { at: "Magistrates", price: [65, 1, 1], gives: "Shearing: while in your personal deck, 50% per journey for a bale of Wool in cargo." },
    source: "docs/cards/plainsfolk.md; D-557",
  },
  "Plainsfolk IX": {
    stages: ["Travel Pass", "Csikós's Papers"], adjective: "Daring",
    refine: { at: "Magistrates", prices: [12], gives: ["Hospitality: at a Farmfolk or Plainsfolk settlement, cargo of 10 or fewer is refilled to 12. Goodwill: at the checkpoint, suspicion −1 per Farmfolk or Plainsfolk settlement visit this map. (Personal deck.)"] },
    adj: { at: "Magistrates", price: 39, gives: "Virtus: when played, a Calf goes straight into the trick's spoils." },
    source: "docs/cards/plainsfolk.md; D-370, D-619, D-620",
  },
  "Plainsfolk X": {
    stages: ["Calf", "Yearling", "Grey Cattle"], adjective: "Stubborn",
    refine: { at: "Magistrates", prices: [7, 10], gives: ["Yearling: Beast of Burden: +4 cargo slots while in your personal deck.", "Grey Cattle: also 10% off settlement services where Plainsfolk live."] },
    adj: { at: "Guild", price: 4, gives: "Stubborn as an Ox: card abilities can't move it within the trick." },
    source: "docs/cards/plainsfolk.md; D-656, D-375",
  },
  "Plainsfolk Alsó": {
    stages: ["Herdhand", "Gulyás"], adjective: "Dusty",
    refine: { at: "Guild", prices: [5], gives: ["Gulyás: Roundup: when played, every VIII and X in the trick gathers beneath it (the bottom card and the claimed card stay)."] },
    adj: { at: "Magistrates", price: 30, gives: "Herd Growth: while in your personal deck, 50% per journey for a Plainsfolk VIII in cargo." },
    source: "docs/cards/plainsfolk.md; D-656",
  },
  "Plainsfolk Felső": {
    stages: ["Horsebreaker", "Csikós"], adjective: "Elusive",
    refine: { at: "Guild", prices: [6], gives: ["Csikós: Thrown from the Saddle: the next card played, if it takes no claim, goes back to its deck and a random encounter card is played instead."] },
    adj: { at: "Magistrates", price: [3, 6], gives: "Breakaway: while in your personal deck, escape road fights: 50% (Csikós 100%)." },
    source: "docs/cards/plainsfolk.md; D-627",
  },
  "Plainsfolk Király": {
    stages: ["Bailiff", "Pusztabíró"], adjective: "Stern",
    refine: { at: "Magistrates", prices: [4], gives: ["Pusztabíró: Establishing the Law: +1 military against Bandits while in your personal deck (two at most)."] },
    adj: { at: "Guild", price: 4, gives: "Law of the Land: the next card played works as its plain base version." },
    source: "docs/cards/plainsfolk.md; D-627",
  },
  "Plainsfolk Ász": {
    stages: ["Outlaw", "Fugitive", "Betyár"], adjective: "Notorious",
    refine: { at: "Guild", prices: [9, 14], gives: ["Fugitive: Great Escape: if the other side takes the trick, it returns to your hand (once per encounter).", "Betyár: returns whoever takes the trick."] },
    adj: { at: "Magistrates", price: 12, gives: "Saddlebag Raid: steals a cargo card from an opposing caravan (not yet working: no other caravans in this build)." },
    source: "docs/cards/plainsfolk.md; D-652, D-357",
  },
  // ---- the Townsfolk suit (urban.md; tracks: valuation/classification.csv; acquisition D-297, D-303, D-620; DRAFT prices)
  "Townsfolk VII": {
    stages: ["Watchman", "Constable"], adjective: "Greedy",
    refine: { at: "Guild", prices: [9], gives: ["Constable: No Funny Business!: the card played directly on top of him can't use its play ability."] },
    adj: { at: "Magistrates", price: 1, gives: "Kickbacks: in cargo, entering a settlement brings a bribe: coins or a rank VIII good [provisional amounts]." },
    source: "docs/cards/urban.md",
  },
  "Townsfolk VIII": {
    stages: ["Tallow Candles", "Wax Candles", "Beeswax Candles"], adjective: "Guiding",
    refine: { at: "Guild", prices: [4, 3], gives: ["Wax Candles: Guiding Light: when played, see one random card in an opponent's hand.", "Beeswax Candles: Guiding Light shows two."] },
    adj: { at: "Magistrates", price: 1, gives: "Light the Way: in cargo, you see what waits at each encounter point before choosing a road." },
    source: "docs/cards/urban.md",
  },
  "Townsfolk IX": {
    stages: ["Residence Permit", "Citizenship Papers"], adjective: "Established",
    refine: { at: "Magistrates", prices: [14], gives: ["Local Craftsmen: in a town, one rank VIII in cargo is refined free. Local Discount: services in towns cost less [provisional %]. (Personal deck; two at most.)"] },
    adj: { at: "Magistrates", price: 9, gives: "Home Advantage: when played, it claims as the rank of the card beneath it (once per encounter)." },
    source: "docs/cards/urban.md; D-260, D-619, D-620, D-656",
  },
  "Townsfolk X": {
    stages: ["Bottled Wine", "Fine Wine", "Spiced Wine"], adjective: "Heady",
    refine: { at: "Guild", prices: [8, 10], gives: ["Fine Wine: Lost Socks: you and your partner swap a random encounter card (once per encounter).", "Spiced Wine: all four players pass one on, nobody keeps their own."] },
    adj: { at: "Guild", price: 4, gives: "Nose for Wealth: shows which caravan carries the richest cargo (not yet working: no other caravans in this build)." },
    source: "docs/cards/urban.md; D-524",
  },
  "Townsfolk Alsó": {
    stages: ["Barmaid", "Tavern Keeper"], adjective: "Sharp",
    refine: { at: "Guild", prices: [5], gives: ["Tavern Keeper: Another Round!: the next player must play an extra card into the trick (once per encounter)."] },
    adj: { at: "Guild", price: 4, gives: "Tavern Gossip: inspecting another caravan shows its cargo by rank (not yet working: no other caravans in this build)." },
    source: "docs/cards/urban.md",
  },
  "Townsfolk Felső": {
    stages: ["Minstrel", "Bard"], adjective: "Artful",
    refine: { at: "Guild", prices: [3], gives: ["Bard: Tall Tales: the card played on top of him looks like a random card to the others (once per encounter)."] },
    adj: { at: "Magistrates", price: 1, gives: "Misinformation: in your personal deck, inspectors may misread the cards they draw, for better or worse [provisional chance]." },
    source: "docs/cards/urban.md; D-397",
  },
  "Townsfolk Király": {
    stages: ["Burgomaster", "Mayor"], adjective: "Pompous",
    refine: { at: "Guild", prices: [26], gives: ["Mayor: Market Day!: two random goods (three if Pompous) pile onto the trick as spoils."] },
    adj: { at: "Magistrates", price: 23, gives: "Taxation: in cargo, entering a town brings 1 coin per face card in cargo." },
    source: "docs/cards/urban.md",
  },
  "Townsfolk Ász": {
    stages: ["Architect", "Master Builder", "Royal Architect"], adjective: "Ingenious",
    refine: { at: "Guild", prices: [89, 65], gives: ["Master Builder: Erection: four encounter cards rise face-down on the trick; the winner takes them (once per encounter).", "Royal Architect: one of the four is also refined."] },
    adj: { at: "Magistrates", price: 1, gives: "Structural Improvements: in your personal deck, suspicion-free cargo up to 40 (no extra slots)." },
    source: "docs/cards/urban.md; D-525, D-556",
  },
  // ---- the Carnivalfolk suit (carnival.md; tracks D-652; acquisition D-302, D-390; DRAFT prices)
  "Carnivalfolk VII": {
    stages: ["Knife Thrower", "Sword Swallower"], adjective: "Unflinching",
    refine: { at: "Guild", prices: [12], gives: ["Sword Swallower: Crowd Pleaser: when it takes a claim, 1 coin per non-Carnivalfolk card in the trick."] },
    adj: { at: "Magistrates", price: 3, gives: "Concealed Threat: this Seven raises only half the usual military suspicion (cargo or personal deck)." },
    source: "docs/cards/carnival.md; D-652",
  },
  "Carnivalfolk VIII": {
    stages: ["Carved Toy", "Jointed Doll", "Marionette"], adjective: "Lively",
    refine: { at: "Guild", prices: [12, 24], gives: ["Jointed Doll: Make-Believe: claims as an Alsó or Felső.", "Marionette: claims as any face rank (Alsó, Felső, Király, Ász)."] },
    adj: { at: "Guild", price: [9, 17, 25], gives: "Crowd Favourite: in cargo, 1 / 2 / 3 coins (by stage) at each settlement without Carnivalfolk." },
    source: "docs/cards/carnival.md; D-652, D-742",
  },
  "Carnivalfolk IX": {
    stages: ["Travel Pass", "Juggler's Papers"], adjective: "Dazzling",
    refine: { at: "Magistrates", prices: [4], gives: ["Fairground Rights: settlement income +30%. Safe Passage: 50% to pass a checkpoint whose requirements you miss. (Personal deck.)"] },
    adj: { at: "Magistrates", price: 4, gives: "Right of Way: the next player must play a suit other than the card beneath it, if able." },
    source: "docs/cards/carnival.md; D-619, D-620",
  },
  "Carnivalfolk X": {
    stages: ["Bear Cub", "Trained Bear", "Dancing Bear"], adjective: "Lumbering",
    refine: { at: "Guild", prices: [11, 15], gives: ["Trained Bear: Intimidation: the next player must play one of their most valuable cards.", "Dancing Bear: everyone, until play returns to you."] },
    adj: { at: "Magistrates", price: 3, gives: "Bear Guard: one Seven's worth of military (and military suspicion), in cargo or the personal deck." },
    source: "docs/cards/carnival.md; D-357, D-652",
  },
  "Carnivalfolk Alsó": {
    stages: ["Busker", "Puppeteer"], adjective: "Charming",
    refine: { at: "Guild", prices: [2], gives: ["Puppeteer: Upstage: a face card of another suit played on him sends him to the top (once per encounter)."] },
    adj: { at: "Guild", price: 17, gives: "Street Performance: in your personal deck, 2 coins at each settlement without Carnivalfolk." },
    source: "docs/cards/carnival.md; D-652",
  },
  "Carnivalfolk Felső": {
    stages: ["Tumbler", "Juggler"], adjective: "Deft",
    refine: { at: "Guild", prices: [3], gives: ["Juggler: Juggling Act: when the three cards above him complete four different suits, they spin."] },
    adj: { at: "Guild", price: 25, gives: "Payment in Kind: a random rank VIII good at each settlement without Carnivalfolk (cargo or personal deck)." },
    source: "docs/cards/carnival.md; D-652",
  },
  "Carnivalfolk Király": {
    stages: ["Crier", "Herald"], adjective: "Resounding",
    refine: { at: "Guild", prices: [12], gives: ["Herald: Hear Ye!: names a local suit; everyone after must play it if able, until play returns to you."] },
    adj: { at: "Guild", price: 24, gives: "Roll Up!: in your personal deck, 75% for a local Alsó, Felső, Király or VII at each settlement without Carnivalfolk." },
    source: "docs/cards/carnival.md; D-652",
  },
  "Carnivalfolk Ász": {
    stages: ["Fool", "Jester", "Court Jester"], adjective: "Madcap",
    refine: { at: "Guild", prices: [9, 14], gives: ["Jester: Fool's Gold: one card in every other hand looks like a Jester until played.", "Court Jester: two cards per hand."] },
    adj: { at: "Magistrates", price: 1, gives: "Moving the Goalposts: in your personal deck, 50% on reaching the checkpoint that its requirement is redrawn." },
    source: "docs/cards/carnival.md; D-419, D-525",
  },
  // ---- the Bandits suit (thug.md; tracks D-650 and classification.csv; acquisition D-297, D-303, D-310; DRAFT prices)
  "Bandits VII": {
    stages: ["Brigand", "Reaver"], adjective: "Shifty",
    refine: { at: "Guild", prices: [31], gives: ["Reaver: Pillage: when played, steals a random card from the trick for you, whoever wins."] },
    adj: { at: "Magistrates", price: 6, gives: "Concealed Muscle: in cargo, concealment equal to half its military (suspicion −0.5)." },
    source: "docs/cards/thug.md; D-191, D-212, D-650",
  },
  "Bandits VIII": {
    stages: ["Plunder", "Loot", "Choice Pickings"], adjective: "Dubious",
    refine: { at: "Guild", prices: [4, 3], gives: ["Loot: Contamination: when played, another VIII in the trick turns into Bandits goods.", "Choice Pickings: worth more."] },
    adj: { at: "Guild", price: 1, gives: "Hidden Extras: each time this card is refined, 50% for an extra Plunder in cargo." },
    source: "docs/cards/thug.md; D-639",
  },
  "Bandits IX": {
    stages: ["Travel Pass", "False Identity"], adjective: "Convincing",
    refine: { at: "Magistrates", prices: [10], gives: ["False Manifest: Bandits VIII in cargo give double concealment (personal deck). False Identity (not yet working: no other caravans)."] },
    adj: { at: "Magistrates", price: 4, gives: "Identity Theft: when played, it becomes an exact copy of the card beneath it for the trick, abilities included." },
    source: "docs/cards/thug.md; D-257, D-619, D-620",
  },
  "Bandits X": {
    stages: ["Mandrake", "Essence", "Witch's Elixir"], adjective: "Intoxicating",
    refine: { at: "Guild", prices: [11, 10], gives: ["Essence: Hallucination: every card below takes a random suit for the trick and replays its abilities.", "Witch's Elixir: worth more."] },
    adj: { at: "Magistrates", price: 1, gives: "Black Market: in cargo, income on arriving at a town (2 / 3 / 4 by stage) [provisional amounts]." },
    source: "docs/cards/thug.md; D-310",
  },
  "Bandits Alsó": {
    stages: ["Cutpurse", "Highwayman"], adjective: "Devious",
    refine: { at: "Magistrates", prices: [81], gives: ["Highwayman: Highway Robbery: in your personal deck, highways pay you the toll instead of charging it."] },
    adj: { at: "Guild", price: 1, gives: "Sleight of Hand: entering a trick with no Seven, one random card in it moves to a random place (once per encounter)." },
    source: "docs/cards/thug.md; D-499",
  },
  "Bandits Felső": {
    stages: ["Fence", "Master Fence"], adjective: "Shrewd",
    refine: { at: "Guild", prices: [10], gives: ["Master Fence: Criminal Commission: 5% of the winning side's spoils, in coins, whoever wins."] },
    adj: { at: "Magistrates", price: 6, gives: "Roadside Refinement: in your personal deck, refines one Bandits VIII in cargo on every road." },
    source: "docs/cards/thug.md; D-193",
  },
  "Bandits Király": {
    stages: ["Bandit Chief", "Crime Lord"], adjective: "Crooked",
    refine: { at: "Guild", prices: [7], gives: ["Crime Lord: Protection Racket: with two other Bandits cards in the trick, he takes it whatever the rank."] },
    adj: { at: "Magistrates", price: 75, gives: "Extortion: in your personal deck, 1 coin per Bandits face card in cargo on every road." },
    source: "docs/cards/thug.md",
  },
  "Bandits Ász": {
    stages: ["Thief", "Robber", "Zsivány"], adjective: "Brazen",
    refine: { at: "Guild", prices: [17, 51], gives: ["Robber: Theft: every player loses a random hand card into the trick (once per encounter).", "Zsivány: 25% to be paid their combined value."] },
    adj: { at: "Magistrates", price: 1, gives: "Checkpoint Bribery: opens checkpoint bribes and buys 10 / 20 / 30% concealment there by stage (cargo or personal deck) [provisional]." },
    source: "docs/cards/thug.md; D-334, D-673, D-674, D-737",
  },
  // ---- the Beasts suit (wild.md; tracks D-651 and classification.csv; acquisition D-297, D-620; DRAFT prices)
  "Beasts VII": {
    stages: ["Boar", "Tusker"], adjective: "Rooting",
    refine: { at: "Guild", prices: [10], gives: ["Tusker: Rampage: when played, the whole trick is shuffled."] },
    adj: { at: "Magistrates", price: 30, gives: "Rooting: in cargo, 50% per road for a Beasts VIII." },
    source: "docs/cards/wild.md",
  },
  "Beasts VIII": {
    stages: ["Mushrooms", "Sorted Mushrooms", "Edible Mushrooms"], adjective: "Bountiful",
    refine: { at: "Guild", prices: [5, 6], gives: ["Sorted Mushrooms: Proliferation: 25% to copy itself into the trick.", "Edible Mushrooms: Proliferation 50%."] },
    adj: { at: "Magistrates", price: 30, gives: "Spore Spread: in cargo, 50% per road for a basket of Mushrooms." },
    source: "docs/cards/wild.md; D-651",
  },
  "Beasts IX": {
    stages: ["Travel Papers (Woodland)", "Treebark"], adjective: "Odd-Smelling",
    refine: { at: "Magistrates", prices: [21], gives: ["Wild Stench: each Beasts face card you carry lowers suspicion by 1 (personal deck). Game Trails (not yet working: the maps have no alternative roads)."] },
    adj: { at: "Magistrates", price: [1, 16], gives: "Smelly Treebark: when played, 50% for a random Beasts card in the trick above it, for you." },
    source: "docs/cards/wild.md; D-256, D-276, D-420, D-619, D-620",
  },
  "Beasts X": {
    stages: ["Honey", "Mead", "Spiced Mead"], adjective: "Fortified",
    refine: { at: "Guild", prices: [46, 10], gives: ["Mead: Sticky Residue: a Honey sticks to the next trick, above its first card.", "Spiced Mead: worth more."] },
    adj: { at: "Magistrates", price: 6, gives: "Preservation: in cargo, saves one other cargo card from loss in each road fight." },
    source: "docs/cards/wild.md",
  },
  "Beasts Alsó": {
    stages: ["Wolf", "Alpha"], adjective: "Pack",
    refine: { at: "Guild", prices: [31], gives: ["Alpha: Pack Instinct: claims against any rank, like the Conscript; a matching card or a Seven takes it back."] },
    adj: { at: "Magistrates", price: 3, gives: "Pack Hunting: in cargo, every two Beasts Alsó in cargo count as one Seven of military." },
    source: "docs/cards/wild.md; D-486",
  },
  "Beasts Felső": {
    stages: ["Lynx", "Phantom"], adjective: "Solitary",
    refine: { at: "Guild", prices: [11], gives: ["Phantom: Stalking: marks a card in the trick; it advances one refinement stage when the trick is taken."] },
    adj: { at: "Magistrates", price: 8, gives: "Solitary Hunter: in cargo, as your only Beasts Felső, it lowers suspicion by 3." },
    source: "docs/cards/wild.md; D-486",
  },
  "Beasts Király": {
    stages: ["Bear", "Monarch"], adjective: "Mighty",
    refine: { at: "Guild", prices: [7], gives: ["Monarch: Bear's Might: swaps the two cards beneath him (never the bottom card)."] },
    adj: { at: "Magistrates", price: 45, gives: "King of the Forest: in cargo, 50% per road for a random ordinary Beasts card." },
    source: "docs/cards/wild.md; D-525",
  },
  "Beasts Ász": {
    stages: ["White Stag", "Majestic Stag", "Divine Stag"], adjective: "Unerring",
    refine: { at: "Guild", prices: [12, 16], gives: ["Majestic Stag: Divine Guidance: shows how many cards in the other hands could take the trick.", "Divine Stag: also whose."] },
    adj: { at: "Magistrates", price: 3, gives: "True Path: in your personal deck, an ambush or deserter encounter is rerolled once." },
    source: "docs/cards/wild.md; D-519, D-600",
  },
  // ---- the King's Men suit (royal.md; tracks D-651, D-656 and classification.csv; acquisition D-297, D-303, D-620; DRAFT prices)
  "King's Men VII": {
    stages: ["Infantryman", "Veteran"], adjective: "Seasoned",
    refine: { at: "Guild", prices: [14], gives: ["Veteran: Reinforcements: when played, a Conscript joins your hand for this encounter (once per encounter)."] },
    adj: { at: "Magistrates", price: 2, gives: "Basic Training: in cargo, 50% per road to drill a Conscript in cargo into an Infantryman." },
    source: "docs/cards/royal.md",
  },
  "King's Men VIII": {
    stages: ["Spoils", "Keepsakes", "Heirloom"], adjective: "Hard-Won",
    refine: { at: "Guild", prices: [3, 3], gives: ["Keepsakes: Refinement Jackpot: refining it into Heirloom has 5% for a random X or Ász.", "Heirloom: any King's Men VIII you refine has 5% for a random X or Ász."] },
    adj: { at: "Guild", price: [3, 2, 1], gives: "Victory Refinement: played from your hand, it refines one stage when your side takes the trick." },
    source: "docs/cards/royal.md; D-526, D-629, D-651, D-656",
  },
  "King's Men IX": {
    stages: ["Travel Pass", "Marching Orders"], adjective: "Royal",
    refine: { at: "Magistrates", prices: [4], gives: ["Marching Formation: +1 military in road fights [provisional amount]. Official Business: with over half your personal deck King's Men, military adds no suspicion. (Personal deck.)"] },
    adj: { at: "Magistrates", price: 9, gives: "By Royal Decree!: when played, the trick gets one more full round of plays (once per encounter)." },
    source: "docs/cards/royal.md; D-619, D-620, D-656",
  },
  "King's Men X": {
    stages: ["Warhorse", "Charger", "Nightmare"], adjective: "Defiant",
    refine: { at: "Magistrates", prices: [8, 11], gives: ["Charger: Run Them Down!: in your personal deck, 10% to overcome a military disadvantage in a road fight.", "Nightmare: 25%."] },
    adj: { at: "Guild", price: 9, gives: "Back in the Saddle!: when played, your partner's last card in the trick moves up beside the horse." },
    source: "docs/cards/royal.md",
  },
  "King's Men Alsó": {
    stages: ["Recruiter", "Muster Officer"], adjective: "Strict",
    refine: { at: "Guild", prices: [5], gives: ["Muster Officer: Muster!: when played, 50% for a Conscript in your cargo (once per encounter)."] },
    adj: { at: "Magistrates", price: 3, gives: "Military Escort: in your personal deck, each Conscript in cargo counts as a Seven of military." },
    source: "docs/cards/royal.md",
  },
  "King's Men Felső": {
    stages: ["Squire", "Knight"], adjective: "Aspiring",
    refine: { at: "Guild", prices: [3], gives: ["Knight: Knight's Authority: a Conscript on his side keeps its claim even against a Seven."] },
    adj: { at: "Magistrates", price: 1, gives: "Ransom: in cargo, coins for each road fight you win [provisional amount]." },
    source: "docs/cards/royal.md",
  },
  "King's Men Király": {
    stages: ["Commander", "General"], adjective: "Victorious",
    refine: { at: "Guild", prices: [15], gives: ["General: Spoils of War!: when played, 50% for King's Men Spoils in your cargo (once per encounter)."] },
    adj: { at: "Magistrates", price: 4, gives: "War Chest: in your personal deck, every road fight you win brings King's Men Spoils." },
    source: "docs/cards/royal.md",
  },
  "King's Men Ász": {
    stages: ["Tactician", "Strategist", "Mastermind"], adjective: "Cunning",
    refine: { at: "Guild", prices: [17, 11], gives: ["Strategist: Battle Formation!: when played, the trick is sorted by rank, up or down (50/50).", "Mastermind: 75% Aces first."] },
    adj: { at: "Magistrates", price: [6, 6, 9], gives: "Contingency Plan: in your personal deck, losing a road fight you keep 2 of the cards you'd lose (Mastermind 3)." },
    source: "docs/cards/royal.md; D-383, D-525",
  },
  // ---- the Clergy suit (piros.md; D-650 to D-656; acquisition D-297, D-303; DRAFT prices)
  "Clergy VII": {
    stages: ["Devotee", "Fanatic"], adjective: "Undying",
    refine: { at: "Guild", prices: [6], gives: ["Fanatic: turns one other non-Clergy Seven in the trick into Clergy (an encounter card for good; a personal card only for that trick)."] },
    adj: { at: "Guild", price: 4, gives: "Resurrection: after the trick it goes back into the deck it came from instead of being captured." },
    source: "docs/cards/piros.md; D-650",
  },
  "Clergy VIII": {
    stages: ["Medicinal Herbs", "Herbal Remedies", "Potent Medicines"], adjective: "Restorative",
    refine: { at: "Guild", prices: [8, 8], gives: ["Herbal Remedies: worth more; Second Chance: when played, 25% to copy a random card from the previous trick (a basic copy, placed above it; its claim belongs to that card's player).",
                                                  "Potent Medicines: Second Chance rises to 50%."] },
    adj: { at: "Magistrates", price: 4, gives: "Field Medicine: while in your cargo, protects one face card (Alsó to Ász) from loss: surrendered to a checkpoint, a minor checkpoint or a patrol, taken in an ambush, or confiscated in a checkpoint fight." },
    source: "docs/cards/piros.md; D-242, D-268, D-651",
  },
  "Clergy X": {
    stages: ["Scriptures", "Illuminated Manuscripts", "Sacred Tome"], adjective: "Revered",
    refine: { at: "Magistrates", prices: [8, 10], gives: ["Illuminated Manuscripts: Proselytising: your Evangelists' Conversion turns one more face card.",
                                                        "Sacred Tome: Conversion turns two more."] },
    adj: { at: "Guild", price: 1, gives: "Sacred Teachings: while in your personal deck, Patronage pays more." },
    source: "docs/cards/piros.md; D-303, D-384, D-558, D-656",
  },
  "Clergy Alsó": {
    stages: ["Pilgrim", "Disciple"], adjective: "Fervent",
    refine: { at: "Guild", prices: [2], gives: ["Pilgrim's Offering: +1 coin for the side that takes a trick with this Disciple and a Clergy Felső or Király in it."] },
    adj: { at: "Magistrates", price: 20, gives: "Pilgrimage: while in your personal deck, 50% per journey to gain a Clergy Alsó in your cargo." },
    source: "docs/cards/piros.md; D-650",
  },
  "Clergy Felső": {
    stages: ["Missionary", "Evangelist"], adjective: "Esteemed",
    refine: { at: "Guild", prices: [3], gives: ["Conversion: at the end of a trick with the Evangelist, one non-Clergy Alsó, Felső or Király in it becomes Clergy for good."] },
    adj: { at: "Guild", price: 1, gives: "Patronage: while in your personal deck, visiting a town pays you by the Clergy face cards in your cargo." },
    source: "docs/cards/piros.md; D-303, D-650",
  },
  "Clergy Király": {
    stages: ["Bishop", "Archbishop"], adjective: "Militant",
    refine: { at: "Guild", prices: [7], gives: ["Ecclesiastical Authority: with three other Clergy cards in the trick, the Archbishop takes it, and nothing played after overturns that (even retroactively)."] },
    adj: { at: "Magistrates", price: 6, gives: "Holy Host: while in your personal deck, each Clergy Alsó, Felső and Király in your cargo counts as half a Seven of military." },
    source: "docs/cards/piros.md; D-650",
  },
  "Clergy Ász": {
    stages: ["Priestess", "Holywoman", "Oracle"], adjective: "Radiant",
    refine: { at: "Guild", prices: [9, 14], gives: ["Holywoman: Echo of Fate: when played, a basic copy of the trick's bottom card comes to your hand for this match.",
                                                  "Oracle: Echo of Fate makes a perfect copy instead."] },
    adj: { at: "Magistrates", price: 9, gives: "Checkpoint Influence: in your personal deck, lowers checkpoint suspicion by 5% (Holywoman) or 15% (Oracle; 20% with a refined Clergy X), and lets you bribe inspectors and requirements." },
    source: "docs/cards/piros.md; D-653",
  },
  "Farmfolk VIII": {
    stages: ["Wheat", "Flour", "Provisions"], adjective: "Packed",
    refine: { at: "Guild", prices: [5, 6], gives: [
      "Flour: worth more; Feed the Masses: when played in a Zsír trick, 20% chance to refine one random Alsó in the trick by one stage.",
      "Provisions: worth more; Feed the Masses rises to 40%."] },
    adj: { at: "Magistrates", price: 1, gives: "Bulk Storage: every two Packed cards in your cargo take up one slot (capacity and suspicion)." },
    source: "docs/cards/makk.md; D-241, D-273, D-303, D-388, D-651",
  },
  // ---- the rest of the Farmfolk suit (D-650 to D-653; acquisition D-297, D-303, D-824 (3); DRAFT prices)
  "Farmfolk VII": {
    stages: ["Guard", "Hajdú"], adjective: "Wary",
    refine: { at: "Guild", prices: [9], gives: ["Herd Guard: with a Farmfolk X anywhere in the same trick, the Hajdú's claim is protected; only a later Seven overturns it."] },
    adj: { at: "Magistrates", price: 3, gives: "Herd Protection: while in your personal deck, it saves one Farmfolk produce card you would lose in an ambush." },
    source: "docs/cards/makk.md; D-195, D-234, D-653",
  },
  "Farmfolk X": {
    stages: ["Cattle", "Prize Cattle", "Champion Breeding Bull"], adjective: "Headstrong",
    refine: { at: "Guild", prices: [7, 10], gives: ["Prize Cattle: worth more; Stud Service: income at every village while in your personal deck.",
                                                   "Champion Breeding Bull: Stud Service income doubles."] },
    adj: { at: "Guild", price: 1, gives: "Bull Toss: when a Seven is played directly on top of it, the two swap places (a Seven tossed to the bottom becomes the card to match)." },
    source: "docs/cards/makk.md; D-249, D-303, D-651",
  },
  "Farmfolk Alsó": {
    stages: ["Farmhand", "Conscript"], adjective: "Seasonal",
    refine: { at: "Guild", prices: [31], gives: ["Conscript capture: takes the claim against any rank (not from a Seven); a later card of the matching rank or a Seven takes it back."] },
    adj: { at: "Guild", price: 2, gives: "Harvest Wages: +1 coin for the side that takes a trick it's in, when a Farmfolk VIII or X is in that trick too." },
    source: "docs/cards/makk.md; valuation/classification.csv (A010 refinement, A011 adjective)",
  },
  "Farmfolk Felső": {
    stages: ["Husbandman", "Improver"], adjective: "Wise",
    refine: { at: "Guild", prices: [29], gives: ["Quality Improvement: improves a Farmfolk good in the trick by one value tier (not yet working: tier values undefined, V8-01)."] },
    adj: { at: "Magistrates", price: 36, gives: "Field Research: while in your personal deck, every journey along a non-highway road finds an upgraded Farmfolk VIII (rarely a Farmfolk X)." },
    source: "docs/cards/makk.md; D-382, D-387, D-651",
  },
  "Farmfolk Király": {
    stages: ["Landowner", "Lord"], adjective: "Prosperous",
    refine: { at: "Guild", prices: [7], gives: ["Conscription: when the Lord is in a trick, one Farmfolk Alsó in it becomes a Conscript for good."] },
    adj: { at: "Magistrates", price: 1, gives: "Fealty: while in your personal deck, after every journey you gain 2 coins per 4 Farmfolk VIII or X in your cargo." },
    source: "docs/cards/makk.md; D-650",
  },
  "Farmfolk Ász": {
    stages: ["Sheep", "Silken-Fleeced Lamb", "Golden-Fleeced Lamb"], adjective: "Magnificent",
    refine: { at: "Guild", prices: [9, 11], gives: ["Silken-Fleeced Lamb: worth more; Sticky Fleece (not yet working: bundle values undefined).",
                                                   "Golden-Fleeced Lamb: worth much more; Sticky Fleece without the bundle suspicion (not yet working)."] },
    adj: { at: "Guild", price: 1, gives: "Travelling Spectacle: while in your personal deck, income at every settlement (more for a Golden-Fleeced Lamb); at most two sheep count." },
    source: "docs/cards/makk.md; D-303, D-651",
  },
};

const key = (c) => `${c.suit} ${c.rank}`;
// an alternative card's line: the base stage's name, from its own name (with or without an adjective prefix)
export function lineBase(c) {
  if (c.line) return c.line;
  if (!c.name) return null;
  let base = null;
  for (const st of COMMODITY_STAGES) {
    if (st.stage === 0) base = st.name;
    if (st.suit === c.suit && st.rank === c.rank && st.roster === c.roster && (c.name === st.name || c.name.endsWith(" " + st.name))) return base;
  }
  return null;
}
export const entry = (c) => {
  if (!c.roster || c.roster === "main") return CATALOGUE[key(c)] || null;
  if (c.roster === "rural roster") return CATALOGUE[`${key(c)} (rural)`] || null;
  if (c.roster === "agricultural roster") return CATALOGUE[`${key(c)} (agricultural)`] || null;
  const e = CATALOGUE[`${key(c)} ${lineBase(c)}`];
  return e && e.alt ? e : null;
};

/** the card's displayed name under the two-track naming (D-296): adjective prefix + current stage name */
export function upgradedName(c) {
  const e = entry(c); if (!e) return c.name;
  const stage = e.stages[c.refined || 0];
  return `${c.adjective ? c.adjective + " " : ""}${stage}`;
}

/** what a settlement with these services offers for this card: the next refinement stage and the adjective */
export function offers(c, services) {
  const e = entry(c); if (!e) return [];
  const out = [], r = c.refined || 0;
  if (r < e.stages.length - 1 && services.includes(e.refine.at))
    out.push({ track: "refine", at: e.refine.at, price: e.refine.prices[r], to: e.stages[r + 1], gives: e.refine.gives[r] });
  if (e.adj && !c.adjective && services.includes(e.adj.at))
    out.push({ track: "adjective", at: e.adj.at, price: Array.isArray(e.adj.price) ? e.adj.price[r] : e.adj.price, to: e.adjective, gives: e.adj.gives });
  return out;
}

export function apply(c, track) {
  const e = entry(c); if (e && e.alt) c.line = e.stages[0];
  if (track === "refine") c.refined = (c.refined || 0) + 1; else c.adjective = e.adjective;
  c.name = upgradedName(c);
}

export const CHURCH_NOTE = "The Church sells Attrition blessings only (D-302). Not available yet: Attrition prices are undefined (SET-10) and parts of the Attrition rules are still open.";
