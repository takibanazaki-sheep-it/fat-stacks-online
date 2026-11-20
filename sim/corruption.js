// Corruption cards beyond the mercenaries (docs/cards/corruption.md; D-336, D-348, D-726, D-751 to D-755, D-764 to D-777; built
// D-1186). Stray cards from other games, shown as corrupted data. They live in the personal deck. Found glitched: at the Fence, or
// in the encounter deck of a glitching settlement or POI (D-751). A glitched card is never drawn and only takes up space (and counts
// toward personal-deck size suspicion, D-755); sell it at the Fence, or have a church identify it: expensive, dearer after each
// identification, the price resetting each run (D-755). An identification yields a random card, the UNO-style ones most common.
//
// Corruption is a pseudo-suit (D-348): all Corruption cards match one another; it can't be demanded or targeted as a suit; a card
// that "plays as" a rank claims as that rank, and rank-based effects otherwise exclude it.
//
// Readings (D-1190): Summoned Monster upright takes the claim whatever the rank (as Indulgence), sideways keeps your side's claim
// for the rest of the trick (a kept claim); Elven Paratroopers lower the opposing military by PLACEHOLDER 1, once per encounter.
// Not built, undesigned in the record: Domino (which dot counts map to which suits), Black Peter's overworld effect and second
// version ("to be designed").
import { PLACEHOLDER } from "./rules.js";

// id: name, the rank it plays as ("—" = rankless junk upright), what it does; weight in an identification (UNO cards most common)
export const CORRUPTION = {
  van:         { name: "Stat Card: Delivery Van", rank: "X", w: 1, text: "Counts as a basic X. Overworld: 40 cart slots, no added suspicion (D-752, D-770)." },
  lorry:       { name: "Stat Card: Lorry", rank: "X", w: 1, text: "Counts as a basic X. Overworld: 52 cart slots, no added suspicion (D-771)." },
  joker:       { name: "Joker", rank: "—", w: 1, text: "When played, becomes the last played card until the end of the trick (D-771)." },
  blank:       { name: "Blank Spare Card", rank: "—", w: 1, text: "When played, becomes the capture target until the end of the trick (D-771)." },
  jailfree:    { name: "Get Out of Inspection Free", rank: "—", w: 1, text: "Skips one inspection (not the Royal Castle's), then it's gone (D-752)." },
  paratroopers:{ name: "Elven Paratroopers", rank: "VII", w: 1, text: "Plays as a basic Seven. Military power without suspicion (D-752)." },
  transit:     { name: "Monthly Transit Pass", rank: "IX", w: 1, text: "Free highway tolls in the region where it was identified. Plays like a IX; never counts toward checkpoint requirements (D-764, D-765)." },
  tram:        { name: "Punched Tram Ticket", rank: "IX", w: 1, text: "Skips one highway toll, then it's used up. Plays like a IX; never counts toward checkpoint requirements (D-767, D-768)." },
  library:     { name: "Library Card", rank: "VIII", w: 1, text: "One free identification at a church, then used up; it doesn't raise the next price. Plays like a VIII (D-767, D-768)." },
  receipt:     { name: "Receipt", rank: "VIII", w: 1, text: "Plays as a VIII. Sold at the Fence, it becomes 5 random basic commodities (D-773)." },
  energy:      { name: "Generic Energy Card", rank: "VIII", w: 1, text: "Plays like a VIII. The next Corruption card your team plays in the trick triggers its on-play effect twice (D-777)." },
  bicycle:     { name: "Bicycle", rank: "—", w: 1, text: "A combo: goes down only together with an Alsó, Felső or Ász, in the same turn; the pair counts as one Király until the end of the trick (D-780)." },
  monster:     { name: "Summoned Monster", rank: "—", w: 1, text: "Upright: takes the claim, whatever the rank. Sideways: your side's claim can't be taken for the rest of the trick (D-752; readings D-1190)." },
  lottery:     { name: "Lottery Ticket", rank: "—", w: 1, text: "Sold only at the Fence: nothing 65%, a small win 20%, a bigger win 10%, the largest 5% (D-764)." },
  peter:       { name: "Black Peter", rank: "—", noSuit: true, w: 1, text: "Cursed. Played while your team holds the claim, it gives the claim to the last card the other team played. Sell it at the Fence (D-775)." },
  skip:        { name: "Stray Skip", rank: "—", attr: "Ász", w: 3, text: "Sideways: Skip (an Attrition ability, no upgrade needed). Upright: junk (D-754)." },
  drawtwo:     { name: "Stray Draw Two", rank: "—", attr: "VII", w: 3, text: "Sideways: Draw Two (an Attrition ability, no upgrade needed). Upright: junk (D-754)." },
  wild:        { name: "Stray Wild", rank: "—", attr: "Felső", w: 3, text: "Sideways: Suit Request (an Attrition ability, no upgrade needed). Upright: junk (D-754)." },
  number:      { name: "Stray Number Card", rank: "—", attr: "IX", w: 3, text: "Sideways: Rank Request (an Attrition ability, no upgrade needed). Upright: junk (D-754)." },
};

export const isCorr = (c, id) => !!c && c.suit === "Corruption" && !c.merc && (id ? c.corr === id : !!c.corr);
export const isGlitched = (c) => isCorr(c, "glitched");

/** a glitched card: corrupted data, unidentified */
export function glitched() { return { suit: "Corruption", rank: "—", corr: "glitched", name: "Glitched card", note: "Corrupted data: never drawn, takes up space. Sell it at the Fence or have a church identify it (D-751)." }; }

/** an identified Corruption card */
export function corrCard(id, extra = {}) {
  const d = CORRUPTION[id];
  return { suit: "Corruption", rank: d.rank, corr: id, name: d.name, note: d.text, ...(d.attr ? { attrition: true, attrRank: d.attr } : {}),
    ...(id === "monster" ? { attrition: true, attrRank: "monster" } : {}), ...extra };   // the Monster's sideways play is its defence
}

/** a church's identification: a random card from the pool, weighted (D-755) */
export function identify(rng) {
  const ids = Object.keys(CORRUPTION), tot = ids.reduce((a, k) => a + CORRUPTION[k].w, 0);
  let x = rng.next() * tot;
  for (const k of ids) { x -= CORRUPTION[k].w; if (x < 0) return k; }
  return ids[ids.length - 1];
}

/** the identification price: dearer after each one this run (D-751, D-755); PLACEHOLDER base and step */
export const identifyPrice = (n) => Math.ceil(PLACEHOLDER.corruption.identify * Math.pow(PLACEHOLDER.corruption.identifyStep, n));
