// TEMPORARY outcome modules for Milestone A (D-856). Each has the interface the real module will have, so it can be
// swapped out without touching the engine. Nothing here is a rule: every effect is a labelled placeholder.
import { PLACEHOLDER } from "./rules.js";

// Encounter point: draw the event by the board's real odds (encounter_gen); every event's effect is built (encounters.js, engine.js roadEncounter).
export function encounterEvent(stop, rng) {
  const odds = Object.entries(stop.odds || {});
  if (!odds.length) return { event: "nothing" };
  const [event] = rng.weighted(odds, ([, p]) => p);
  return { event };
}

// Location Zsír opportunity (D-425): appears or not, at a placeholder chance.
export function locationOpportunity(rng) {
  return rng.next() < PLACEHOLDER.tempLocationMatchChance;
}
