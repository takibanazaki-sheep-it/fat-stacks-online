// POI partner negotiation (D-150, D-263, D-282, D-298, D-872). Single-player: the player and three local NPCs.
// The pool is six concrete two-sided deals, one per category; every participant gets four of them at random and picks one;
// the player and an NPC who pick the same deal partner on its terms; with no match the player chooses from the NPCs' picks.
// Every amount is a PLACEHOLDER (PLACEHOLDER.negotiation); D-263 sets no prices.
import { PLACEHOLDER, RANKS } from "./rules.js";
import { cardFromStage, stagesOf } from "./encounters.js";

const pickN = (rng, arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

/** the six deals for this POI; card demands use the location's pool (D-264) */
export function offerPool(rng, suits, value) {
  const N = PLACEHOLDER.negotiation;
  const want = { rank: rng.pick(["X", "Ász", "IX", "Király"]), suit: rng.pick(suits) };
  const wantPrice = Math.ceil(value(want) * N.cardPriceMult);
  return [
    { cat: 1, id: "card", card: want, price: wantPrice,
      text: `Your partner pays you ${wantPrice} coins for the ${want.rank} of ${want.suit}, if your team captures it.` },
    { cat: 2, id: "valuables-for-upgrades",
      text: "After the match you give your partner one valuable card (an X or Ász from your cargo); they give you an upgraded card." },
    { cat: 3, id: "upgrades-for-valuables",
      text: "After the match you give your partner one upgraded card from your cargo; they give you a valuable card." },
    { cat: 4, id: "money-up-front", amount: N.upFront, text: `You pay your partner ${N.upFront} coins now.` },
    { cat: 5, id: "profit-share", share: N.profitShare,
      text: `After the match you pay your partner ${Math.round(N.profitShare * 100)} % of the value your team captured, in coins.` },
    { cat: 6, id: "no-demands", text: "No demands: a partnership with no terms." },
  ];
}

// the greedy ally's terms (D-179): it takes its own rewards and yours; you forfeit everything your team captures in this match.
// Only a greedy ally offers it, and only you can accept it; no splitting or alternating picks
export const GREEDY = { cat: 7, id: "greedy", text: "Greedy ally: your partner keeps your share as well as its own: everything your team captures goes to them, and you take nothing captured from this match." };

/** three locals of at least three suit types where the location allows (D-151), each with four offers and a pick */
export function participants(rng, suits, pool) {
  const kinds = pickN(rng, suits, 3);
  while (kinds.length < 3) kinds.push(rng.pick(suits));
  return kinds.map((suit, k) => {
    const shown = pickN(rng, pool, 4);
    // a greedy ally (D-179; D-1183): it asks for your share of the captures as its pick; chance PLACEHOLDER
    if (rng.next() < PLACEHOLDER.negotiation.greedy) return { id: k, suit, name: `${suit} local`, shown, pick: GREEDY, greedy: true };
    return { id: k, suit, name: `${suit} local`, shown, pick: rng.pick(shown) };   // NPC choice: random among its four (an AI placeholder)
  });
}

/** the upgraded card a partner hands over (deal 2): an upgraded commodity stage of a local suit */
export function upgradedGift(rng, suits) {
  const o = stagesOf((s) => s.stage >= 1 && suits.includes(s.suit));
  return o.length ? cardFromStage(rng.pick(o)) : { rank: rng.pick(RANKS), suit: rng.pick(suits), refined: 1 };
}
/** the valuable card a partner hands over (deal 3): a valuable stage of a local suit, else an X */
export function valuableGift(rng, suits) {
  const o = stagesOf((s) => s.tags.includes("valuable") && suits.includes(s.suit));
  return o.length ? cardFromStage(rng.pick(o)) : { rank: "X", suit: rng.pick(suits) };
}
