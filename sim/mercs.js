// Mercenaries (docs/cards/mercenaries.md; D-155 to D-158, D-336 to D-349, D-359 to D-365, D-372, D-377, D-393, D-448).
// A mercenary is a Corruption card that lives only in the personal deck (D-337): suitless and rankless, it claims as a given rank
// (D-338, D-340, D-346, D-347). Before a regular, checkpoint, ambush or duel encounter you choose your companion or one owned
// mercenary as your partner (D-156, D-199); deployed, its card is set aside and it plays from its own transient AI deck (D-157),
// the approved deck for its stage (D-448), each card with the upgrade that grants its intended ability under the two-track model
// (D-919). Stages are linear, bought as upgrade packages (D-336, D-361).
import { entry as upgradeEntry } from "./upgrades.js";

// a deck card: suit, rank, refinement stage, adjective (optional)
const C = (suit, rank, refined = 0, adjective) => ({ suit, rank, refined, adjective });
export const MERCS = [
  { id: 1, title: "the Opportunist", stages: ["Vagabond", "Lurker", "Lidérc", "Vengeful Lidérc"], claims: "VII",
    note: "Bandits and Forestfolk: a patient trick thief (D-338)",
    decks: [
      [C("Bandits", "VII"), C("Forestfolk", "VIII"), C("Bandits", "IX"), C("Forestfolk", "Alsó"), C("Bandits", "Felső"), C("Forestfolk", "Király"), C("Forestfolk", "Ász"), C("Bandits", "Király")],
      // Lurker: Reaver, Trapper; the VIII's and IX's on-play upgrades (D-266), now the tracks that grant False Claim (Cured Hides,
      // D-651) and Identity Theft (the Convincing adjective, D-619)
      [C("Bandits", "VII", 1), C("Forestfolk", "VIII", 1), C("Bandits", "IX", 0, "Convincing"), C("Forestfolk", "Alsó", 1), C("Bandits", "Felső"), C("Forestfolk", "Király"), C("Forestfolk", "Ász"), C("Bandits", "Király")],
      [C("Bandits", "VII", 1), C("Forestfolk", "VIII", 1), C("Bandits", "IX", 0, "Convincing"), C("Forestfolk", "Alsó", 1), C("Bandits", "Felső", 1), C("Forestfolk", "Király", 1), C("Forestfolk", "Ász", 1), C("Bandits", "Király"),
        C("Bandits", "Ász"), C("Forestfolk", "X")],
      [C("Bandits", "VII", 1), C("Forestfolk", "VIII", 1), C("Bandits", "IX", 0, "Convincing"), C("Forestfolk", "Alsó", 1), C("Bandits", "Felső", 1), C("Forestfolk", "Király", 1), C("Forestfolk", "Ász", 2), C("Bandits", "Király", 1),
        C("Bandits", "Ász", 2), C("Forestfolk", "X", 1, "Alluring"), C("Forestfolk", "VII"), C("Bandits", "VIII")],
    ] },
  { id: 2, title: "the Impresario", stages: ["Huckster", "Charlatan", "Impresario", "Illustrious Impresario"], claims: "Felső",
    note: "Carnivalfolk and Fisherfolk (with Bandits): profits from others' contributions; no military (D-340)",
    decks: [
      [C("Carnivalfolk", "VII"), C("Carnivalfolk", "VIII"), C("Carnivalfolk", "IX"), C("Carnivalfolk", "X"), C("Bandits", "Felső"), C("Fisherfolk", "VII"), C("Fisherfolk", "Felső"), C("Fisherfolk", "Ász")],
      [C("Carnivalfolk", "VII"), C("Carnivalfolk", "VIII"), C("Carnivalfolk", "IX"), C("Carnivalfolk", "X"), C("Bandits", "Felső"), C("Fisherfolk", "VII", 1), C("Fisherfolk", "Felső", 1), C("Fisherfolk", "Ász", 1)],
      [C("Carnivalfolk", "VII", 1), C("Carnivalfolk", "VIII", 1), C("Carnivalfolk", "IX"), C("Carnivalfolk", "X", 1), C("Bandits", "Felső"), C("Fisherfolk", "VII", 1), C("Fisherfolk", "Felső", 1), C("Fisherfolk", "Ász", 1),
        C("Bandits", "IX"), C("Carnivalfolk", "Ász")],
      [C("Carnivalfolk", "VII", 1), C("Carnivalfolk", "VIII", 2), C("Carnivalfolk", "IX", 1, "Dazzling"), C("Carnivalfolk", "X", 2), C("Bandits", "Felső", 1), C("Fisherfolk", "VII", 1), C("Fisherfolk", "Felső", 1), C("Fisherfolk", "Ász", 2),
        C("Bandits", "IX", 0, "Convincing"), C("Carnivalfolk", "Ász", 1), C("Carnivalfolk", "Király", 1), C("Carnivalfolk", "Alsó", 1)],
    ] },
  { id: 3, title: "the Grizzled Warhound", stages: ["Deserter", "Mutineer", "Warhound", "Grizzled Warhound"], claims: "VII",
    note: "King's Men and Farmfolk (with Plainsfolk): an old soldier; counts as a VII (D-346)",
    decks: [
      [C("King's Men", "VII"), C("King's Men", "IX"), C("King's Men", "Felső"), C("King's Men", "Király"), C("King's Men", "Ász"), C("Farmfolk", "VII"), C("Farmfolk", "Alsó"), C("Farmfolk", "X")],
      [C("King's Men", "VII"), C("King's Men", "IX", 1, "Royal"), C("King's Men", "Felső", 1), C("King's Men", "Király"), C("King's Men", "Ász", 1), C("Farmfolk", "VII"), C("Farmfolk", "Alsó", 1), C("Farmfolk", "X")],
      [C("King's Men", "VII", 1), C("King's Men", "IX", 1, "Royal"), C("King's Men", "Felső", 1), C("King's Men", "Király", 1), C("King's Men", "Ász", 2), C("Farmfolk", "VII", 1), C("Farmfolk", "Alsó", 1), C("Farmfolk", "X", 1, "Headstrong"),
        C("King's Men", "X"), C("Farmfolk", "Király")],
      [C("King's Men", "VII", 1), C("King's Men", "IX", 1, "Royal"), C("King's Men", "Felső", 1), C("King's Men", "Király", 1), C("King's Men", "Ász", 2), C("Farmfolk", "VII", 1), C("Farmfolk", "Alsó", 1), C("Farmfolk", "X", 1, "Headstrong"),
        C("King's Men", "X", 0, "Defiant"), C("Farmfolk", "Király", 1), C("Plainsfolk", "Alsó", 1), C("Farmfolk", "Ász", 1)],
    ] },
  { id: 4, title: "the Avaricious Profiteer", stages: ["Shady Peddler", "Hawker", "Profiteer", "Avaricious Profiteer"], claims: "Felső",
    note: "Plainsfolk and Townsfolk: protection, disruption, emergency commerce (D-347)",
    decks: [
      [C("Plainsfolk", "VIII"), C("Plainsfolk", "X"), C("Townsfolk", "VII"), C("Townsfolk", "VIII"), C("Townsfolk", "IX"), C("Townsfolk", "X"), C("Townsfolk", "Felső"), C("Townsfolk", "Alsó")],
      [C("Plainsfolk", "VIII", 2), C("Plainsfolk", "X"), C("Townsfolk", "VII", 1), C("Townsfolk", "VIII", 1), C("Townsfolk", "IX"), C("Townsfolk", "X"), C("Townsfolk", "Felső", 1), C("Townsfolk", "Alsó")],
      [C("Plainsfolk", "VIII", 2), C("Plainsfolk", "X", 1, "Stubborn"), C("Townsfolk", "VII", 1), C("Townsfolk", "VIII", 1), C("Townsfolk", "IX", 1, "Established"), C("Townsfolk", "X", 1), C("Townsfolk", "Felső", 1), C("Townsfolk", "Alsó", 1),
        C("Townsfolk", "Király"), C("Plainsfolk", "Ász")],
      [C("Plainsfolk", "VIII", 2), C("Plainsfolk", "X", 1, "Stubborn"), C("Townsfolk", "VII", 1), C("Townsfolk", "VIII", 1), C("Townsfolk", "IX", 1, "Established"), C("Townsfolk", "X", 1), C("Townsfolk", "Felső", 1), C("Townsfolk", "Alsó", 1),
        C("Townsfolk", "Király", 1), C("Plainsfolk", "Ász", 1), C("Plainsfolk", "Király", 0, "Stern"), C("Plainsfolk", "VII", 0, "Dogged")],
    ] },
];
export const mercOf = (card) => card && card.merc ? MERCS.find((x) => x.id === card.merc) : null;

/** the mercenary's own card for the personal deck at a stage: a Corruption card, suitless and rankless, claiming as its rank */
export function mercCard(id, stage = 0) {
  const M = MERCS.find((x) => x.id === id);
  return { merc: id, stage, rank: M.claims, suit: "Corruption", name: M.stages[stage], note: `Mercenary (${M.title}): claims as a ${M.claims}; ${M.note}` };
}
/** its AI deck at its stage (D-448), named from the cards' own lines */
export function mercDeck(card) {
  const M = mercOf(card);
  return M.decks[card.stage].map((d) => {
    const e = upgradeEntry({ suit: d.suit, rank: d.rank }), stage = e ? e.stages[Math.min(d.refined, e.stages.length - 1)] : null;
    return { suit: d.suit, rank: d.rank, ...(d.refined ? { refined: d.refined } : {}), ...(d.adjective ? { adjective: d.adjective } : {}),
      ...(stage ? { name: (d.adjective ? d.adjective + " " : "") + stage } : {}), mercDeck: true };
  });
}
// the mercenary card's own overworld effects, by stage (mercenaries.md)
export const MERC = {
  lurker: (x) => x.merc === 1 && x.stage >= 1,                 // +1 military in encounters at stops where Forestfolk live (not checkpoints)
  liderc: (x) => x.merc === 1 && x.stage >= 2,                 // zero military suspicion (still a VII for strength, D-372)
  impresario: (x) => x.merc === 2,                             // no military strength at all (D-340)
  charlatan: (x) => x.merc === 2 && x.stage >= 1,              // False Advertising
  sweetTalk: (x) => x.merc === 2 && x.stage >= 2,              // Sweet Talk (checkpoint redraw)
  deserter: (x) => x.merc === 3,                               // supply acquisition (every stage; D-346)
  mutineer: (x) => x.merc === 3 && x.stage >= 1,               // Checkpoint Bribery access (D-397, D-470)
  hawker: (x) => x.merc === 4 && x.stage >= 1,                 // the travelling and checkpoint shops (next pass)
};
