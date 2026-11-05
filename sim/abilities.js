// Card abilities in the slice. Only upgraded cards have abilities (D-647). IMPLEMENTED: the cards in upgrades.js's subset
// (Farmfolk IX, Clergy IX, Farmfolk VIII). NOT IMPLEMENTED (a known gap): the abilities of other upgraded cards that can
// reach the player through Travelling Merchant, found treasure, the broken-down caravan or Feed the Masses (e.g. Clergy
// VIII Second Chance, Tradesfolk VIII Merchant's Cut, a Farmfolk Conscript's capture, D-651); they behave as plain cards.
import { RULES, PLACEHOLDER, ALL_SUITS } from "./rules.js";
import { matchSay, card, claimOf } from "./zsir.js";
import { COMMODITY_STAGES } from "./commodity-data.js";
import { entry as upgradeEntry, lineBase } from "./upgrades.js";

/** Farmfolk IX: Travel Pass -> Farmer's Papers (refinement), adjective Unassuming (docs/cards/makk.md). */
export const FARMFOLK_IX = {
  // Passive, refinement (D-619): personal deck only, drawn or not
  expandedCarryingCapacity: (card) => (!card.roster || card.roster === "main") && card.suit === "Farmfolk" && card.rank === "IX" && card.refined >= 1,
  // Passive, refinement: "additional concealment from agricultural cargo" -- concealment is negative suspicion (D-259);
  // the amount is a balance value (PLACEHOLDER.concealment.agricultural, per Farmfolk or agricultural-roster cargo card)
  agriculturalConcealment: (card) => (!card.roster || card.roster === "main") && card.suit === "Farmfolk" && card.rank === "IX" && card.refined >= 1,
  // Trick Ability, adjective Unassuming (D-245, D-619): Travelling Merchant
  travellingMerchant: (card) => (!card.roster || card.roster === "main") && card.suit === "Farmfolk" && card.rank === "IX" && card.adjective === "Unassuming",
};

/** Clergy IX: Travel Pass -> Pilgrim's Papers (refinement), adjective Clerical (docs/cards/piros.md). */
export const CLERGY_IX = {
  // Passive, refinement (D-619): personal deck only. "Waives highway fees" [src:1016-1017]; applies to the emergency
  // return's tolls by its own text (D-323)
  highwayFeeExemption: (card) => (!card.roster || card.roster === "main") && card.suit === "Clergy" && card.rank === "IX" && card.refined >= 1,
  // Trick Ability, adjective Clerical (D-246): Collection Plate
  collectionPlate: (card) => (!card.roster || card.roster === "main") && card.suit === "Clergy" && card.rank === "IX" && card.adjective === "Clerical",
};

/** Farmfolk VIII: Wheat -> Flour -> Provisions; Feed the Masses is refinement-owned (D-651): Flour 20%, Provisions 40%. */
export const FARMFOLK_VIII = { feedTheMasses: (card) => (!card.roster || card.roster === "main") && card.suit === "Farmfolk" && card.rank === "VIII" && card.refined >= 1 };
const ALSO_MAX_STAGE = 1;
const FARMFOLK_FELSO_IMPROVER = (c) => (!c.roster || c.roster === "main") && c.suit === "Farmfolk" && c.rank === "Felső" && (c.refined || 0) >= 1;   // every main-roster Alsó has one refinement stage (valuation/configurations.csv)

const main = (card) => !card.roster || card.roster === "main";   // abilities belong to main-roster cards here
const inPersonal = (caravan, test) => caravan.personal.some(test);
export const highwayExempt = (caravan) => inPersonal(caravan, CLERGY_IX.highwayFeeExemption);

/** Physical capacity and the suspicion-free threshold: 32, or 40 with Farmer's Papers in the personal deck (D-714, D-744).
 *  Threshold-setting effects don't stack. */
// Beast of Burden (Yearling, Grey Cattle in the personal deck): +4 cargo slots, not stacking (plainsfolk.md, D-375)
export function capacity(caravan) {
  return (inPersonal(caravan, FARMFOLK_IX.expandedCarryingCapacity) ? RULES.capacityFarmfolk : RULES.capacity) + (inPersonal(caravan, PLAINS.burden) ? 4 : 0)
    + 8 * Math.min(2, caravan.personal.filter(RURAL.wandering).length);   // Wandering (rural Tradesfolk Ász; D-553, D-555, D-352)
}

/** Ability hook for Zsír matches: called after every card play. */
// Weighted Odds (Engraved Dice 5 %, Loaded Dice 10 %; D-602): for the rest of the trick each random SELECTION a card effect
// makes may lean to the dice team: with that chance it picks at random among the outcomes after which the dice team holds the
// claim (if any); otherwise, ordinary random. after(option) returns the stack that option would produce
function choose(m, rng, opts, after) {
  const w = m.trick && m.trick.weighted;
  if (w && opts.length > 1 && rng.next() < w.chance) {
    const good = opts.filter((o) => { const r = after(o); const cl = r && r.length ? claimOf(r) : null; return cl && cl.team === w.team; });
    if (good.length) return good[Math.floor(rng.next() * good.length)];
  }
  return opts[Math.floor(rng.next() * opts.length)];
}
const shuffled = (rng, xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Dead Weight (Heavy rural Townsfolk Millstone, by stage; D-624, D-625): Grooved protects the card directly beneath, Stitched every
// card beneath, the Pair the whole stack (itself included); protected cards can't be moved, removed, swapped, transformed or
// refined by any ability of either team, and insertions that would shift one fail; to the end of the trick
const isMill = (x) => x.card.roster === "rural roster" && x.card.suit === "Townsfolk" && x.card.rank === "X" && x.card.adjective === "Heavy" && !x.horizontal && !x.based && !x.suppressed && !x.silenced;
export function frozen(st, x) {
  for (const w of st.filter(isMill)) {
    const i = st.indexOf(w), j = st.indexOf(x), r = w.card.refined || 0;
    if (r >= 2 || (r === 1 && j < i) || (r === 0 && j === i - 1)) return true;
  }
  return false;
}
const canInsert = (st, pos) => !st.slice(pos).some((x) => frozen(st, x));
// Coverup (Woven Reeds line, any stage): an ability that acts on the bottom card acts on the topmost Woven card instead; the bottom
// card stays the capture target (D-576, D-577)
const isWoven = (x) => x.card.roster === "alternative" && x.card.suit === "Fisherfolk" && x.card.rank === "VIII" && x.card.adjective === "Woven" && !x.horizontal && !x.based && !x.silenced;
export function bottomTarget(st) { const w = st.filter(isWoven); return w.length ? w[w.length - 1] : st[0]; }
// Entanglement (Willow Withies: the card beneath can't be removed; Wicker Bundles: neither card can be removed or repositioned), to
// the end of the trick; it ends if the Willow leaves the trick; transformations and claims untouched (D-590, D-593)
export function bound(st, x, move = false) {
  if (x.binds && x.binds.full && st.includes(x)) return true;
  return st.some((w) => w.binds && w.binds.target === x && (!move || w.binds.full));
}
// Insulation (Guba): an insulated bottom card ignores the next card ability that would move or change it (consumed)
const insulated = (x) => { if (x && x.insulated) { x.insulated = false; return true; } return false; };
// a card sent back to the deck it came from, shuffled in (Thrown from the Saddle)
function toOrigin(m, c) {
  const pile = c.origin === "pers" ? (m.personal[c.ownerSeat] || m.personal[0]) : m.deck;
  pile.splice(Math.floor(m.rng.next() * (pile.length + 1)), 0, c);
}
const BANDIT = (c) => c.suit === "Bandits";

export function onPlay(rng) {
  const run = cardAbilities(rng);
  return (m, seat, c) => {
    const st = m.trick.stack; let me = st[st.length - 1];
    const t = m.trick, g0 = m.generated.length, c0 = m.coins;
    // Fermentation (Grape Must 25 %, Barrelled Wine 50 %): the next player's chosen card may be swapped for a random card of
    // their hand (the chosen one included), which is played instead (D-561)
    if (t.ferment && seat !== t.ferment.by) {
      const f = t.ferment; t.ferment = null;
      if (rng.next() < f.chance && m.hands[seat].length) {
        const pool = [me.card, ...m.hands[seat]], pick = choose(m, rng, pool, (x) => st.map((y) => (y === me ? { ...y, card: x } : y)));
        if (pick !== me.card) { m.hands[seat].splice(m.hands[seat].indexOf(pick), 1, me.card); me.card = pick; c = pick;
          matchSay(m, `Fermentation: ${m.names[seat]}'s hand slips; the ${pick.rank} of ${pick.suit} is played instead.`); }
      }
    }
    // Revulsion (Noble Rot Harvest): the next card played can't establish a claim if the card to match is an X (D-563)
    if (t.revulsion && me.card !== t.revulsion.card) { t.revulsion = null; if (st[0].card.rank === "X") { me.noClaim = true; matchSay(m, "Revulsion: the rot puts this card off claiming the X."); } }
    // Indulgence (Authentic Aszú): the next card of the owner's side claims, whatever it is (D-564)
    if (t.indulge && seat % 2 === t.indulge.team && me.card !== t.indulge.card) { t.indulge = null; me.indulged = true; matchSay(m, "Indulgence: this card claims the trick."); }
    // Written Protection ends if the trick continues past the round (D-571): the caller's continuation play
    if (t.phase === "continue") for (const x of st) delete x.prot;
    // what held the claim before this card (Stubborn Roots, Fine Vellum)
    const before = claimOf(st.slice(0, -1)), heldBy = before ? st[before.index] : null;
    // Thrown from the Saddle (Csikós): the next card played, if it has no claim, goes back to its deck and a random
    // encounter-deck card is played in its place for the same player; the returned card's ability doesn't resolve; no
    // trigger with an empty encounter deck; the replacement isn't re-checked (plainsfolk.md)
    const below = st[st.length - 2];
    if (below && below.saddle) {
      below.saddle = false;
      if (claimOf(st).index !== st.length - 1 && m.deck.length && !ALT.tools(me.card)) {
        const idx = choose(m, rng, m.deck.map((_, i) => i), (i) => [...st.slice(0, -1), { seat, card: m.deck[i] }]);
        const r = m.deck.splice(idx, 1)[0]; st.pop(); toOrigin(m, me.card);
        me = { seat, card: r }; st.push(me); c = r;
        matchSay(m, `Thrown from the Saddle: the card goes back to its deck; ${r.rank} of ${r.suit} is played in its place.`);
      }
    }
    // Law of the Land (Stern Plainsfolk Király): the next card played works as its unupgraded base version for that play
    const prev = st[st.length - 2];
    // Tall Tales: the card played on top of the Bard shows as a random card to everyone but its player and the Bard's player
    if (prev && prev.tallTales && !prev.based) {
      prev.tallTales = false;
      me.disguise = { rank: rng.pick(["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"]), suit: rng.pick(SUITS12) };
      me.disguise.hidden = seat !== 0 && prev.seat !== 0;
      if (me.disguise.hidden) { const i = m.log.length - 1; if (i >= 0) m.log[i] = `${m.names[seat]} plays what looks like the ${me.disguise.rank} of ${me.disguise.suit} (Tall Tales).`; }
    }
    me.round = t.rounds || 1;
    if (isMerc(me.card, 2) && once(m, "impersonate", me.card)) impersonate(m, me, rng);   // before its (borrowed) abilities run
    if (isMerc(me.card, 3) && m.hands && m.deck && once(m, "recruits", me.card)) freshRecruits(m, rng);
    // Outfitting: the next allied Hillfolk card claims as a Seven
    if (t.outfit && seat % 2 === t.outfit.team && me.card.suit === "Hillfolk" && me.card !== t.outfit.card) { t.outfit = null; me.claimRank = "VII"; matchSay(m, "Outfitting: the smith's work lets it claim as a Seven."); }
    if (st.includes(me)) beforeAbilities(m, me, rng);
    const saltedFirst = st.includes(me) && salting(m, me, true);
    // Defiance: no new Király abilities for the rest of the trick (D-627)
    if (t.defiance && me.card.rank === "Király") { me.silenced = true; matchSay(m, "Defiance: this king's ability has no power here."); }
    else if (prev && prev.noFunny && !prev.based) { prev.noFunny = false; matchSay(m, "No Funny Business! The card's play ability doesn't trigger."); }
    else if (saltedFirst) { /* Refined Salt: salted before its ability, which doesn't trigger */ }
    else if (prev && prev.sleepy && !prev.based && !prev.silenced) { prev.sleepy = false; matchSay(m, "Sleepy: the card nods off on the feathers; its ability doesn't trigger."); }
    else if (prev && prev.lawNext) { prev.lawNext = false; me.suppressed = true; me.based = true; matchSay(m, "Law of the Land: this card plays as its plain base version."); }
    else {
      // To Arms! (Salvaged Weapons: the next allied face card; Surplus Arms: the next allied card) gains the Conscript ability
      // to the end of the trick; a second grant adds nothing (D-631)
      if (t.toArms && seat % 2 === t.toArms.team && me.card !== t.toArms.card && (!t.toArms.face || ["Alsó", "Felső", "Király", "Ász"].includes(me.card.rank))) {
        t.toArms = null; me.conscripted = true; matchSay(m, "To Arms! The card claims like a Conscript.");
      }
      run(m, seat, c);
      // Chain Reaction: an allied card's play ability fires a second time, never more (D-634)
      const ch = t.chain;
      if (ch && seat % 2 === ch.team && me.card !== ch.card && !ALT.saltpetre(me.card) && st.includes(me)) {
        if (ch.next) t.chain = null;
        m.chainRun = true; try { run(m, seat, me.card, me); } finally { m.chainRun = false; }
      }
    }
    // Sticky Residue: a Honey directly above the bottom card of the next trick (once that trick is led)
    if (st.length === 1 && m.sticky && m.sticky.length) {
      const due = m.sticky.filter((x) => x.after < m.tricksDone); m.sticky = m.sticky.filter((x) => x.after >= m.tricksDone);
      if (canInsert(st, 1)) for (const x of due) st.splice(1, 0, { seat: x.seat, card: card("X", "Beasts", { origin: "enc", generated: true, name: "Honey" }) });
      if (due.length) matchSay(m, `Sticky Residue: ${due.length} Honey stick${due.length === 1 ? "s" : ""} to the new trick.`);
    }
    // Claim Suppression ends when another claimant is played on top of the Court Merchant (D-539)
    if (st.includes(me) && claimOf(st).index === st.indexOf(me)) for (const x of st) if (x.cut && x.cut !== me && st.indexOf(x.cut) < st.indexOf(me)) delete x.cut;
    // Ward Off (Caravan Guard): the opposing card played third above it can't establish its claim (D-541)
    for (const w of st.filter((x) => x.ward && st.indexOf(me) - st.indexOf(x) === 3)) { w.ward = false; if (w.seat % 2 !== seat % 2) { me.noClaim = true; matchSay(m, "Ward Off: the Caravan Guard keeps that card from claiming."); } }
    // Haggling (Crafty rural Peddler): a non-point card played directly on it, 25 % (Travelling Merchant 50 %), drops one rank
    // for the trick after its own abilities; the lower card's abilities don't fire; VII can't drop (D-535 to D-537)
    if (prev && !prev.based && !prev.horizontal && RURAL.crafty(prev.card) && st.includes(me) && !["X", "Ász", "VII"].includes(me.card.rank) && !ALT.tools(me.card) && once(m, "haggle", prev.card)) {
      if (!frozen(st, me) && rng.next() < (prev.card.refined >= 1 ? 0.5 : 0.25)) { remember(me); me.card.rank = RANK_ORDER[RANK_ORDER.indexOf(me.card.rank) - 1]; matchSay(m, `Haggling: talked down to a ${me.card.rank}.`); }
    }
    // Upstage (Puppeteer): a face card of another suit played directly on top of him: he moves to the top, after that card's
    // ability; once per encounter
    const face = (x) => ["Alsó", "Felső", "Király", "Ász"].includes(x.rank);
    if (prev && !prev.based && !prev.horizontal && CARNIVAL.puppeteer(prev.card) && face(me.card) && me.card.suit !== prev.card.suit
        && st.includes(prev) && !frozen(st, prev) && !(prev === st[0] && insulated(prev)) && once(m, "upstage", prev.card)) {
      st.splice(st.indexOf(prev), 1); st.push(prev); matchSay(m, "Upstage! The Puppeteer steals the show and moves to the top.");
    }
    // Juggling Act (Juggler): when the three cards directly above him make, with him, four different suits, those three rotate
    // 2, 3 or 4 times (3 = no change); once per play of the Juggler
    for (const j of st.filter((x) => CARNIVAL.juggler(x.card) && !x.horizontal && !x.based && !x.juggled)) {
      const i = st.indexOf(j), three = st.slice(i + 1, i + 4);
      if (three.length < 3) continue;
      j.juggled = true;
      const suits = new Set(three.map((x) => x.card.suit));
      if (suits.size === 3 && !suits.has("Carnivalfolk")) {
        const rot = (n) => { const t3 = three.slice(); for (let k = 0; k < n; k++) t3.unshift(t3.pop()); return t3; };
        const turns = choose(m, rng, [2, 3, 4], (n) => [...st.slice(0, i + 1), ...rot(n), ...st.slice(i + 4)]);
        for (let k = 0; k < turns; k++) three.unshift(three.pop());
        if (three.some((x) => frozen(st, x))) continue;
        st.splice(i + 1, 3, ...three); matchSay(m, `Juggling Act: the three cards above the Juggler spin ${turns} times.`);
      }
    }
    // Fine Vellum: every attempt to take the protected claim pays its player 3 coins (Sevens, any claiming card; D-571)
    if (heldBy && heldBy.prot && heldBy.prot.vellum && st.includes(heldBy)) {
      const p = heldBy.prot; delete heldBy.prot; const would = claimOf(st).index === st.indexOf(me); heldBy.prot = p;
      if (would && team2(seat) !== team2(heldBy.seat) && p.seat % 2 === 0) { m.coins += 3; matchSay(m, "Fine Vellum: the attempt fails, and it's written down: +3 coins."); }
    }
    // Stubborn Roots (Dried Millet): when another commodity takes its claim, its owner gets 2 coins (once per encounter, D-560)
    if (heldBy && heldBy.roots === "pay" && heldBy !== me && (me.card.rank === "VIII" || me.card.rank === "X") && claimOf(st).index === st.indexOf(me)) {
      heldBy.roots = null; if (heldBy.seat % 2 === 0) { m.coins += 2; matchSay(m, "Stubborn Roots: the millet gives way, for 2 coins."); }
    }
    // Hot Pursuit (Dogged Plainsfolk VII): when a Bandits card (from Pandúr also the Plainsfolk Betyár) is played above the
    // Lawman, the Lawman moves to the top after that card's ability; once per Lawman per trick
    const top = st[st.length - 1];
    const trigger = (law) => BANDIT(top.card) || (law.card.refined >= 1 && top.card.suit === "Plainsfolk" && top.card.rank === "Ász" && (top.card.refined || 0) >= 2);
    for (const law of st.filter((x) => x !== top && !x.horizontal && !x.based && PLAINS.dogged(x.card) && !x.pursued && trigger(x))) {
      if ((law === st[0] && insulated(law)) || frozen(st, law)) continue;
      law.pursued = true; st.splice(st.indexOf(law), 1); st.push(law);
      matchSay(m, "Hot Pursuit: the Lawman rides to the top of the trick.");
    }
    if (m.lek && seat === m.lek.seat && me.card !== m.lek.card) m.lek = null;            // Lekking binds only the next player
    if (st.includes(me) && !saltedFirst) salting(m, me, false);                          // Crushed Salt: after its ability
    // Slippery: the first card on the Loach, after its ability, 30 % slips to a random place between the Loach and the card to match
    if (prev && prev.slippy && st.includes(me) && st.includes(prev)) {
      prev.slippy = false; const lo = st.indexOf(prev);
      if (lo >= 1 && movable(st, me) && rng.next() < 0.3) { st.splice(st.indexOf(me), 1); const pos = 1 + Math.floor(rng.next() * lo); st.splice(pos, 0, me); matchSay(m, "Slippery: the card slides down among the loaches."); }
    }
    // the summoned Tusker's Rampage (Alluring Scent)
    if (t.tuskerRampage) { t.tuskerRampage = false; const tk = st.find((x) => x.neutral); if (tk) beastsOnPlay(m, -1, tk.card, tk, rng, () => {}); }
    // Tempting: a later card that takes the claim may go for the Beaver instead (each its own roll)
    if (t.tempt && me !== t.tempt.entry && st.includes(t.tempt.entry) && st.includes(me) && claimOf(st).index === st.indexOf(me) && rng.next() < t.tempt.chance) {
      me.decoy = true; matchSay(m, `Tempting: the ${me.card.rank} of ${me.card.suit} goes for the Beaver instead.`);
    }
    // Lost in the Woods ends at the next claim change
    if (t.lost && t.lost.entry !== (claimOf(st) ? st[claimOf(st).index] : null)) t.lost = null;
    if (t.disconcert && st.includes(me)) disconcert(m, me, rng);
    if (st.includes(me) && m.hands) { vengeful(m, seat, me, heldBy, rng); profiteer(m, seat, rng); }
    afterPlay(m, seat, me, heldBy);
    // a shared match (D-914): what seat 2's own abilities gain belongs to that seat's owner, not to you (it isn't your companion)
    if ((m.shared || m.mercHalf) && seat === 2) { (m.sideGains ??= { generated: [], coins: 0 }).generated.push(...m.generated.splice(g0)); m.sideGains.coins += m.coins - c0; m.coins = c0; }
  };
}
function cardAbilities(rng) {
  const self = (m, seat, c, entry) => {
    // Bull Toss (D-249): a Seven played directly on top of a Headstrong Farmfolk X swaps places with it; if the X was the
    // bottom card, the Seven becomes the card to match (D-206)
    const st = m.trick.stack, n = st.length;
    if (c.rank === "VII" && n >= 2 && FARMFOLK.headstrong(st[n - 2].card) && !st[n - 2].horizontal && !frozen(st, st[n - 2]) && !(n === 2 && insulated(st[0]))) {
      [st[n - 2], st[n - 1]] = [st[n - 1], st[n - 2]];
      matchSay(m, `Bull Toss! The Seven is tossed under the ${st[n - 1].card.name || "Farmfolk X"}.`);
    }
    // Travelling Merchant (D-245): when played during a Zsír trick, 50% chance to generate one random Refinement I Rank VIII
    // commodity of any suit into the player's permanent cargo. During an encounter it is held until the post-match
    // overflow step (D-736). The companion plays from the player's deck; its rewards go to the player (D-216).
    // D-267: an on-play ability benefits whoever plays the card, from any deck; an NPC's gain isn't modelled
    if (FARMFOLK_IX.travellingMerchant(c) && seat % 2 === 1) matchSay(m, "Travelling Merchant: played by the other side; the benefit is theirs (D-267).");
    else if (FARMFOLK_IX.travellingMerchant(c)) {
      if (rng.next() < 0.5) {
        const g = { rank: "VIII", suit: rng.pick(ALL_SUITS), refined: 1 };
        m.generated.push(g);
        matchSay(m, `Travelling Merchant: a ${g.suit} VIII commodity (Refinement I) joins your cargo after the match.`);
      } else matchSay(m, "Travelling Merchant: no luck this time (50%).");
    }
    // Fanatic (Clergy VII): one other non-Clergy Seven in the trick becomes Clergy; an encounter card for good, a personal
    // card only until the trick ends. Checked whenever a Seven or the Fanatic is played (once per Fanatic).
    if (c.rank === "VII") {
      const fan = st.find((x) => !x.horizontal && CLERGY.fanatic(x.card) && !x.fanaticUsed);
      const target = fan && st.find((x) => x !== fan && x.card.rank === "VII" && x.card.suit !== "Clergy");
      if (target && ((target === st[0] && insulated(target)) || frozen(st, target))) fan.fanaticUsed = true;
      else if (target) { fan.fanaticUsed = true; if (target.card.origin === "pers") target.revertSuit = target.card.suit;
        else if (target.card.ref) target.card.ref.suit = "Clergy";
        target.card.suit = "Clergy"; matchSay(m, "Fanatic: a Seven in the trick turns to Clergy."); }
    }
    // Second Chance (Clergy VIII, refined; D-242, D-268): 25 % (Potent Medicines 50 %) to copy a random card of the previous
    // trick as a basic card placed directly above; it counts as played; its claim belongs to the copied card's player
    if (CLERGY.remedies(c) && m.lastTrick) {
      if (rng.next() < (c.refined >= 2 ? 0.5 : 0.25)) {
        const src = rng.pick(m.lastTrick.stack);
        st.push({ seat: src.seat, card: card(src.card.rank, src.card.suit, { origin: "enc", generated: true }) });
        matchSay(m, `Second Chance: a copy of the ${src.card.rank} of ${src.card.suit} joins the trick for ${m.names[src.seat]}.`);
      } else matchSay(m, "Second Chance: no effect this time.");
    }
    // Echo of Fate (Clergy Ász: Holywoman a basic copy, Oracle a perfect copy of the trick's bottom card) into the player's
    // hand; transient, never permanently captured, gone at the end of the encounter (piros.md)
    if (CLERGY.echo(c) && st.length) {
      const b = bottomTarget(st).card, copy = c.refined >= 2 ? { ...b } : { rank: b.rank, suit: b.suit };   // Coverup redirects it (D-577)
      delete copy.id; delete copy.ref;
      m.hands[seat].push(card(copy.rank, copy.suit, { ...copy, origin: "pers", echo: true }));
      matchSay(m, `Echo of Fate: ${m.names[seat]} ${seat === 0 ? "get" : "gets"} a ${c.refined >= 2 ? "perfect" : "basic"} copy of the ${b.rank} of ${b.suit}.`);
    }
    const me = entry || st[st.length - 1];
    // Gilded Bait (Tradesfolk X, refined): its value in coins (Amulet twice) goes to the side that takes the trick
    if (TRADES.bait(c)) { me.bait = (m.value ? m.value(c) : 0) * (c.refined >= 2 ? 2 : 1); matchSay(m, `Gilded Bait: ${me.bait} coins wait for whoever takes this trick.`); }
    // Commodity Exchange (Enterprising Tradesfolk IX; D-248, D-275): 50 % to turn every Rank VIII in the trick into another
    // suit's good at the same stage, for good; a personal card keeps its identity after the encounter (transience prevails)
    if (TRADES.enterprising(c)) {
      if (rng.next() < 0.5) {
        for (const x of st.filter((y) => y.card.rank === "VIII")) {
          if ((x === st[0] && insulated(x)) || frozen(st, x)) continue;
          const to = rng.pick(SUITS12);
          if (x.card.origin === "pers") { x.revertSuit = x.revertSuit || x.card.suit; x.revertName = x.revertName ?? x.card.name; }
          setSuit(x.card, to); if (x.card.ref && x.card.origin === "enc") setSuit(x.card.ref, to);
        }
        matchSay(m, "Commodity Exchange: the goods in the trick change hands, and suits.");
      } else matchSay(m, "Commodity Exchange: no effect this time.");
    }
    // Distraction (Tradesfolk Ász, refined): the cards beneath her lose their lingering effects (TRK-23: protections, Lock,
    // claims that hold); a Royal Mistress also the card played directly on top of her
    if (TRADES.courtesan(c) && !me.horizontal) {
      // lingering = claims, protections, Lock, blocks (TRK-23): ability claims (Herd Guard, Superior Equipment, Authority,
      // Conscript, Racket, Home Advantage, Make-Believe) via the suppressed flag; Insulation; pending next-card effects; the
      // play restrictions set by cards beneath (Hear Ye!, Right of Way, Intimidation)
      for (const x of st) if (x !== me) { x.suppressed = true; x.insulated = false; x.lawNext = x.noFunny = x.saddle = x.tallTales = false; }
      m.trick.lock = null; m.hearYe = null; m.rightOfWay = null; m.intimidate = null;
      if (c.refined >= 2) me.mistress = true;
      matchSay(m, "Distraction: the cards beneath lose their lasting effects.");
    }
    // Quality Improvement (Improver, Farmfolk Felső refined; D-387, D-651): when it appears in a trick, one Farmfolk goods card
    // present (VIII or X, D-382) gains one value tier; automatic random target; several stack; benefits whoever captures it
    if (FARMFOLK_FELSO_IMPROVER(c)) {
      const el = st.filter((x) => x !== me && x.card.suit === "Farmfolk" && (x.card.rank === "VIII" || x.card.rank === "X"));
      if (el.length) { const x = rng.pick(el); x.card.quality = (x.card.quality || 0) + 1; if (x.card.ref) x.card.ref.quality = x.card.quality;
        matchSay(m, `Quality Improvement: the ${x.card.name || x.card.rank + " of Farmfolk"} is worth more now.`); }
    }
    // Feed the Masses (D-241, D-273, D-651): when a Flour/Provisions is played, 20% / 40%: pick one random Alsó in the
    // trick (any suit, any owner) and advance it one refinement stage; a fully refined Alsó stays in the pool and nothing
    // happens if it's picked. Benefits whoever plays it (D-267). A refined card keeps the change (D-305)
    if (FARMFOLK_VIII.feedTheMasses(c)) {
      const chance = c.refined >= 2 ? 0.4 : 0.2, alsos = m.trick.stack.filter((x) => x.card.rank === "Alsó" && !frozen(m.trick.stack, x));
      if (!alsos.length) matchSay(m, "Feed the Masses: no Alsó in the trick.");
      else if (rng.next() < chance) {
        const pick = rng.pick(alsos).card;
        if ((pick.refined || 0) >= ALSO_MAX_STAGE) matchSay(m, `Feed the Masses picks ${pick.rank} of ${pick.suit}, already fully refined: nothing happens.`);
        else { pick.refined = (pick.refined || 0) + 1; if (pick.ref) pick.ref.refined = pick.refined;
               matchSay(m, `Feed the Masses refines the ${pick.rank} of ${pick.suit} one stage.`); }
      } else matchSay(m, `Feed the Masses: no effect this time (${Math.round(chance * 100)}%).`);
    }
    // ---- Plainsfolk (plainsfolk.md)
    if (PLAINS.csikos(c)) me.saddle = true;
    if (PLAINS.stern(c)) me.lawNext = true;
    // Insulation (Guba): shields an allied bottom card from the next card ability that would affect it
    if (PLAINS.guba(c) && st.length >= 2 && st[0].seat % 2 === seat % 2) { st[0].insulated = true; matchSay(m, "Insulation: the bottom card is wrapped in a guba."); }
    // Virtus (Daring Plainsfolk IX): an unrefined Plainsfolk X straight into the trick's spoils
    if (PLAINS.daring(c)) { me.virtus = (me.virtus || 0) + 1; matchSay(m, "Virtus: a Calf joins this trick's spoils."); }
    // Roundup (Gulyás): every VIII and X already in the stack gathers, in order, directly beneath the Gulyás; the bottom card
    // (the capture target, D-051, D-189, R-58) never moves; a Stubborn X stays put; claims are recalculated
    if (PLAINS.gulyas(c)) {
      const move = st.filter((x, i) => i > 0 && i < st.length - 1 && (x.card.rank === "VIII" || x.card.rank === "X") && !(PLAINS.stubborn(x.card) && !x.horizontal) && !ALT.tools(x.card) && !frozen(st, x));
      if (move.length) { for (const x of move) st.splice(st.indexOf(x), 1); st.splice(st.length - 1, 0, ...move); matchSay(m, `Roundup: ${move.length} commodit${move.length === 1 ? "y gathers" : "ies gather"} beneath the Gulyás.`); }
    }
    if (st.length >= 2 && st[st.length - 2].mistress && st[st.length - 1] === me) { me.suppressed = true; matchSay(m, "Distraction: the Royal Mistress distracts the card on top of her."); }
    altOnPlay(m, seat, c, me, rng, self);
    townsfolkOnPlay(m, seat, c, me, rng, self);
    carnivalOnPlay(m, seat, c, me, rng);
    banditsOnPlay(m, seat, c, me, rng, self);
    beastsOnPlay(m, seat, c, me, rng, self);
    kingsOnPlay(m, seat, c, me, rng);
  };
  return self;
}

// ---- King's Men (royal.md)
const RANK_ORDER = ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"];   // D-383: X follows IX
function kingsOnPlay(m, seat, c, me, rng) {
  const st = m.trick.stack;
  // Reinforcements (Veteran): a transient Conscript in its player's hand; once per encounter
  if (KINGS.veteran(c) && once(m, "reinforce", c)) { m.hands[seat].push(card("Alsó", "Farmfolk", { refined: 1, name: "Conscript", origin: "pers", echo: true })); matchSay(m, `Reinforcements: a Conscript joins ${m.names[seat]}'s hand for this encounter.`); }
  // Muster! (Muster Officer): 50 % for a Conscript in the player's cargo; Spoils of War! (General): 50 % for a King's Men
  // Spoils; each once per encounter, held until after the match (D-736); the player's side only (D-267)
  if (KINGS.musterOfficer(c) && once(m, "muster", c) && seat % 2 === 0 && rng.next() < 0.5) { m.generated.push({ rank: "Alsó", suit: "Farmfolk", refined: 1, name: "Conscript" }); matchSay(m, "Muster! A Conscript signs up and will join your cargo."); }
  if (KINGS.general(c) && once(m, "spoils", c) && seat % 2 === 0 && rng.next() < 0.5) { m.generated.push({ rank: "VIII", suit: "King's Men", name: "Spoils", roster: "main" }); matchSay(m, "Spoils of War! King's Men Spoils will join your cargo."); }
  // By Royal Decree! (Royal IX): the trick gets one more full round; once per encounter
  if (KINGS.royal(c) && once(m, "decree", c)) m.trick.decree = true;
  // Back in the Saddle! (Defiant X): the partner's most recently played card in the trick moves directly above the horse
  if (KINGS.defiant(c)) {
    const p = [...st].reverse().find((x) => x !== me && x.seat === (seat + 2) % 4);
    if (p && movable(st, p)) { st.splice(st.indexOf(p), 1); st.splice(st.indexOf(me) + 1, 0, p); matchSay(m, "Back in the Saddle! The partner's card rides up beside the horse."); }
  }
  // Battle Formation! (Strategist 50/50, Mastermind 25 % ascending / 75 % descending): the whole trick sorted by rank, the
  // Ász on top; a Stubborn card or an insulated bottom stays put; no abilities retrigger
  if (KINGS.strategist(c)) {
    const i0 = st.indexOf(me);
    const arrange = (up) => { const free = st.map((x, i) => (i !== i0 && movable(st, x) ? i : -1)).filter((i) => i >= 0), out = st.slice();
      const xs = free.map((i) => st[i]).sort((a, b) => (RANK_ORDER.indexOf(a.card.rank) - RANK_ORDER.indexOf(b.card.rank)) * (up ? 1 : -1));
      free.forEach((i, k) => { out[i] = xs[k]; }); if (!frozen(st, me)) { out.splice(out.indexOf(me), 1); out.push(me); } return out; };
    const w = m.trick.weighted; let asc = rng.next() < (c.refined >= 2 ? 0.25 : 0.5);
    if (w && rng.next() < w.chance) { const good = [true, false].filter((u) => claimOf(arrange(u)).team === w.team); if (good.length) asc = good[Math.floor(rng.next() * good.length)]; }
    const free = st.map((x, i) => (i !== i0 && movable(st, x) ? i : -1)).filter((i) => i >= 0);
    const xs = free.map((i) => st[i]).sort((a, b) => (RANK_ORDER.indexOf(a.card.rank) - RANK_ORDER.indexOf(b.card.rank)) * (asc ? 1 : -1));
    free.forEach((i, k) => { st[i] = xs[k]; });
    if (!frozen(st, me)) { st.splice(st.indexOf(me), 1); st.push(me); }
    matchSay(m, `Battle Formation! The trick is drawn up ${asc ? "Sevens first" : "Aces first"}.`);
  }
}

// ---- Beasts (wild.md)
const movable = (st, x) => !(PLAINS.stubborn(x.card) && !x.horizontal) && !(x === st[0] && x.insulated) && !frozen(st, x) && !bound(st, x, true);
// the highest refinement stage a card can reach (its catalogue line, else a commodity's three stages, else none)
function maxStage(c) {
  const e = upgradeEntry(c); if (e) return e.stages.length - 1;
  return (c.rank === "VIII" || c.rank === "X") ? 2 : 0;
}
function beastsOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack;
  // Rampage (Tusker): the whole trick is shuffled (a Stubborn card and an insulated bottom card stay put); claims recalculated
  if (BEASTS.tusker(c)) {
    const free = st.map((x, i) => (movable(st, x) ? i : -1)).filter((i) => i >= 0), xs = free.map((i) => st[i]);
    const perms = Array.from({ length: 24 }, () => shuffled(rng, xs));      // a sample of the shuffle's outcomes (Weighted Odds)
    const order = choose(m, rng, perms, (pm) => { const out = st.slice(); free.forEach((i, k) => { out[i] = pm[k]; }); return out; });
    free.forEach((i, k) => { st[i] = order[k]; });
    if (st[0] && st[0].insulated) insulated(st[0]);
    matchSay(m, "Rampage! The Tusker scatters the trick.");
  }
  // Proliferation (Sorted Mushrooms 25 %, Edible Mushrooms 50 %): a copy directly above, upgrades kept, can't proliferate again
  if (BEASTS.sorted(c) && !me.copy && canInsert(st, st.indexOf(me) + 1) && rng.next() < (c.refined >= 2 ? 0.5 : 0.25)) {
    const { id, ref, ...rest } = c;
    st.splice(st.indexOf(me) + 1, 0, { seat, card: card(c.rank, c.suit, { ...rest, origin: "enc", generated: true }), copy: true });
    matchSay(m, "Proliferation: the mushrooms multiply.");
  }
  // Smelly Treebark (Odd-Smelling Beasts IX): 50 % for a random Beasts card, basic or Refinement I, directly above; it counts as
  // played for the IX's player (D-268)
  if (BEASTS.odd(c) && !m.retrigger && canInsert(st, st.indexOf(me) + 1) && rng.next() < 0.5) {
    const rank = rng.pick(["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"]), ref1 = rng.next() < 0.5;
    const v = COMMODITY_STAGES.find((x) => x.suit === "Beasts" && x.rank === rank && x.roster === "main" && x.stage === (ref1 ? 1 : 0));
    const g = card(rank, "Beasts", { origin: "enc", generated: true, ...(ref1 ? { refined: 1 } : {}), ...(v ? { name: v.name } : {}) });
    const e = { seat, card: g }; st.splice(st.indexOf(me) + 1, 0, e);
    matchSay(m, `Smelly Treebark: a ${g.name || rank + " of Beasts"} is drawn by the smell.`);
    m.retrigger = true; try { run(m, seat, g, e); } finally { m.retrigger = false; }
  }
  // Sticky Residue (Mead, Spiced Mead): a Honey directly above the bottom card of the next trick, one per Mead
  if (BEASTS.mead(c)) { (m.sticky ??= []).push({ seat, after: m.tricksDone }); matchSay(m, "Sticky Residue: honey will drip onto the next trick."); }
  // Stalking (Phantom): random prey among the other cards; if a side takes the trick, it advances one refinement stage
  if (BEASTS.phantom(c)) { const el = st.filter((x) => x !== me && !ALT.tools(x.card)); if (el.length) { me.prey = rng.pick(el); matchSay(m, `Stalking: the Phantom marks the ${me.prey.card.rank} of ${me.prey.card.suit}.`); } }
  // Bear's Might (Monarch): the two cards directly beneath swap, unless either is the bottom card
  if (BEASTS.monarch(c)) {
    const i = st.indexOf(me);
    if (i >= 3 && movable(st, st[i - 1]) && movable(st, st[i - 2])) { [st[i - 1], st[i - 2]] = [st[i - 2], st[i - 1]]; matchSay(m, "Bear's Might: the Monarch swaps the two cards beneath him."); }
  }
  // Divine Guidance (Majestic Stag: how many cards in the other hands could take the trick; Divine Stag: whose)
  if (BEASTS.stag(c) && seat % 2 === 0) {
    const per = [1, 2, 3].map((k) => (seat + k) % 4).map((s2) => ({ s2, n: m.hands[s2].filter((x) => claimOf([...st, { seat: s2, card: x }]).index === st.length).length }));
    const total = per.reduce((a, x) => a + x.n, 0);
    matchSay(m, c.refined >= 2 ? `Divine Guidance: ${per.filter((x) => x.n).map((x) => `${m.names[x.s2]} ${x.n}`).join(", ") || "nobody"} could take this trick.`
                               : `Divine Guidance: ${total} card${total === 1 ? "" : "s"} in the other hands could take this trick.`);
  }
}

// ---- Bandits (thug.md)
// a temporary change of identity on a stack entry, undone when the trick ends (D-200 cleanup)
function remember(x) { if (!x.saved) x.saved = { suit: x.card.suit, rank: x.card.rank, refined: x.card.refined, adjective: x.card.adjective, name: x.card.name, roster: x.card.roster, cutPct: x.card.cutPct }; }
export function restoreIdentities(stack) {
  for (const x of stack) if (x.saved) { for (const [k, v] of Object.entries(x.saved)) { if (v === undefined) delete x.card[k]; else x.card[k] = v; } delete x.saved; }
}
function banditsOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack;
  // Contamination (Loot, Choice Pickings): one other rank VIII in the trick becomes a Bandits VIII of the Plunder line at its
  // stage, upgrades kept; an encounter card for good, a personal card for the trick (D-639)
  if (BANDITS.loot(c)) {
    const el = st.filter((x) => x !== me && x.card.rank === "VIII" && !(x.card.suit === "Bandits" && (!x.card.roster || x.card.roster === "main")));
    const x0 = el.length ? rng.pick(el) : null;
    if (x0 && frozen(st, x0)) matchSay(m, "Dead Weight: the millstone holds that card as it is.");
    else if (x0 && x0 === st[0] && insulated(x0)) matchSay(m, "Insulation: the guba keeps the bottom card as it is.");
    else if (x0) { const x = x0;
      if (x.card.origin === "pers") remember(x);
      setSuit(x.card, "Bandits"); if (x.card.origin === "enc" && x.card.ref) setSuit(x.card.ref, "Bandits");
      matchSay(m, `Contamination: a VIII in the trick turns into ${x.card.name || "Bandits goods"}.`); }
  }
  // Identity Theft (Convincing Bandits IX): becomes an exact copy of the card directly beneath, fixed at contact; copied
  // on-play abilities activate; the claim is its player's; until the end of the trick
  if (BANDITS.convincing(c) && st.length >= 2 && st[st.length - 2] !== me && !ALT.tools(st[st.length - 2].card) && !frozen(st, me) && !m.retrigger) {
    const b = st[st.length - 2].card; remember(me);
    for (const k of ["suit", "rank", "refined", "adjective", "name", "roster"]) { if (b[k] === undefined) delete c[k]; else c[k] = b[k]; }
    matchSay(m, `Identity Theft: the papers now say ${b.name || b.rank + " of " + b.suit}.`);
    m.retrigger = true; try { run(m, seat, c); } finally { m.retrigger = false; }
  }
  // Hallucination (Essence, Witch's Elixir): every card below takes a random suit of the twelve for the trick; their on-play
  // abilities retrigger bottom to top under the new suits; never Hallucination again (thug.md, RW-03: the current roster)
  if (BANDITS.essence(c) && !m.retrigger) {
    const below = st.slice(0, st.indexOf(me));
    for (const x of below) { if ((x === st[0] && insulated(x)) || frozen(st, x)) continue; remember(x); setSuit(x.card, rng.pick(SUITS12)); }
    if (below.length) matchSay(m, `Hallucination: the cards below change suit for this trick.`);
    // retrigger bottom to top, re-reading the CURRENT order after each ability (D-237); each card once (D-208)
    m.retrigger = true;
    try { const done = new Set();
      for (let guard = 0; guard < 64; guard++) {
        const next = st.find((x) => below.includes(x) && !done.has(x) && st.indexOf(x) < st.indexOf(me));
        if (!next) break; done.add(next);
        if (!next.horizontal && !next.tower) run(m, next.seat, next.card, next);
      } } finally { m.retrigger = false; }
  }
  // Sleight of Hand (Devious Bandits Alsó): once, on entering a trick with no Seven in it, one random card (any) moves to a
  // random position
  if (BANDITS.devious(c) && !st.some((x) => x.card.rank === "VII") && st.length >= 2 && once(m, "sleight", c)) {
    const cards = st.filter((y) => !(y === st[0] && y.insulated) && !(PLAINS.stubborn(y.card) && !y.horizontal) && !ALT.tools(y.card) && !frozen(st, y));
    const moves = cards.flatMap((y) => Array.from({ length: st.length }, (_, p) => [y, p])).filter(([y, p]) => { const o = st.filter((z) => z !== y); o.splice(p, 0, y); return o.every((z, k) => !frozen(st, z) || st.indexOf(z) === k); });
    const mv = moves.length ? choose(m, rng, moves, ([y, p]) => { const out = st.filter((z) => z !== y); out.splice(p, 0, y); return out; }) : null;
    const x = mv && mv[0];
    if (x) { st.splice(st.indexOf(x), 1); st.splice(mv[1], 0, x); matchSay(m, "Sleight of Hand: a card in the trick changes place."); }
  }
  // Protection Racket (Crime Lord): with at least two other Bandits cards already in the trick, it claims regardless of rank
  // (checked once, at play); a later Seven or a card matching the bottom rank takes it back (claim rule in zsir.js)
  if (BANDITS.crimeLord(c) && st.filter((x) => x !== me && x.card.suit === "Bandits").length >= 2) { me.racket = true; matchSay(m, "Protection Racket: the Crime Lord takes the trick."); }
  // Pillage (Reaver): steals one random capturable card from the trick at once, whoever wins; the loot is the Pillager's
  // alone (D-191, D-212); a personal card is copied as loot and follows its own return rules
  if (BANDITS.reaver(c)) {
    const el = st.filter((x) => x !== me && !x.tower && !ALT.tools(x.card) && !frozen(st, x) && canInsert(st, st.indexOf(x)));   // Tools untargetable (D-641); Dead Weight
    if (el.length) { const x = choose(m, rng, el, (y) => st.filter((z) => z !== y)); st.splice(st.indexOf(x), 1);
      const loot = x.card.origin === "pers" ? card(x.card.rank, x.card.suit, { ...x.card, origin: "enc", generated: true, id: undefined }) : x.card;
      if (x.card.origin === "pers") (m.returned ??= []).push(x.card);
      m.captured[seat % 2].push(loot); matchSay(m, `Pillage: ${m.names[seat]} grab${seat === 0 ? "" : "s"} the ${loot.rank} of ${loot.suit} from the trick.`); }
  }
  // Theft (Robber; Zsivány also a 25 % payout of their combined value): every player loses one random hand card into the
  // trick directly above, in play order; not played (no abilities), they keep their claim rights; once per encounter
  if (BANDITS.robber(c) && once(m, "theft", c)) {
    const draw = () => [0, 1, 2, 3].map((k) => (seat + k) % 4).filter((s2) => m.hands[s2].length).map((s2) => ({ seat: s2, card: m.hands[s2][Math.floor(rng.next() * m.hands[s2].length)], placed: true }));
    if (!canInsert(st, st.indexOf(me) + 1)) { matchSay(m, "Theft: the millstone won't let anything in."); } else {
    const taken = choose(m, rng, Array.from({ length: 24 }, draw), (tk) => { const out = st.slice(); out.splice(out.indexOf(me) + 1, 0, ...tk); return out; });
    for (const x of taken) m.hands[x.seat].splice(m.hands[x.seat].indexOf(x.card), 1);
    st.splice(st.indexOf(me) + 1, 0, ...taken);
    matchSay(m, `Theft: ${taken.length} card${taken.length === 1 ? "" : "s"} are lifted from every hand into the trick.`);
    if (c.refined >= 2 && rng.next() < 0.25) { const v = taken.reduce((a, x) => a + (m.value ? m.value(x.card) : 0), 0);
      if (seat % 2 === 0) { m.coins += v; matchSay(m, `Theft: the Zsivány fences them for ${v} coins.`); } } }
  }
}

// ---- alternative commodities (commodity-alternatives.md); each trick ability once per encounter (D-058, D-313)
const team2 = (s) => s % 2;
const ASZ_SUITS = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Beasts", "Bandits", "Townsfolk", "King's Men", "Hillfolk", "Carnivalfolk", "Fisherfolk", "Plainsfolk"];
const ASZ_ALTS = [{ suit: "Clergy", roster: "alternative", name: "Drifter" }, { suit: "Tradesfolk", roster: "rural roster", name: "Cart" }, { suit: "Beasts", roster: "agricultural roster", name: "Bustard" }];
function altOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack, r = c.refined || 0;
  // Pork: 1 coin when it takes a claim, once per encounter (D-595); Kolbász: refines one random eligible Alsó in the trick by one
  // stage, for good, any deck (D-595)
  if (ALT.pig(c) && r === 1 && claimOf(st).index === st.indexOf(me) && seat % 2 === 0 && once(m, "pork", c)) { m.coins += 1; matchSay(m, "Pork: 1 coin for the claim."); }
  if (ALT.pig(c) && r >= 2 && once(m, "kolbasz", c)) {
    const el = st.filter((x) => x !== me && x.card.rank === "Alsó" && !frozen(st, x) && (x.card.refined || 0) < Math.max(1, (upgradeEntry(x.card)?.stages.length || 2) - 1));
    if (el.length) { const x = rng.pick(el); x.card.refined = (x.card.refined || 0) + 1; const e = upgradeEntry(x.card); if (e) x.card.name = (x.card.adjective ? x.card.adjective + " " : "") + e.stages[x.card.refined];
      if (x.card.ref) { x.card.ref.refined = x.card.refined; x.card.ref.name = x.card.name; } matchSay(m, `Kolbász: the ${x.card.rank} of ${x.card.suit} tastes it and is the better for it.`); }
  }
  // Plains Horse / Courser: the trick fills from the encounter deck to ten cards beneath the horse, all or nothing; the inserted
  // cards aren't played (no abilities, no claims); at Courser the topmost one may claim for the horse's player (D-599, D-600)
  if (ALT.horse(c) && r >= 1 && st.length < 10 && once(m, "herd", c)) {
    const need = 10 - st.length;
    if (m.deck.length >= need && canInsert(st, st.indexOf(me))) {
      const ins = m.deck.splice(m.deck.length - need, need).reverse().map((x) => ({ seat, card: x, inserted: true }));
      if (r >= 2) ins[ins.length - 1].inserted = false, ins[ins.length - 1].noAbility = true;
      st.splice(st.indexOf(me), 0, ...ins);
      matchSay(m, `${r >= 2 ? "Courser" : "Plains Horse"}: the herd brings ${need} card${need === 1 ? "" : "s"} into the trick.`);
    } else matchSay(m, "The horse finds too few cards to bring in.");
  }
  // Weighted Odds (Engraved 5 %, Loaded 10 %): the later-played dice decide (D-602)
  if (ALT.dice(c) && r >= 1 && once(m, "odds", c)) m.trick.weighted = { team: seat % 2, chance: r >= 2 ? 0.1 : 0.05 };
  // Calling the Dance (Lute: Alsó, Felső, Király; Harp: Ász too): those cards of the encounter deck, shuffled, go to its top (D-604)
  if (ALT.koboz(c) && r >= 1 && once(m, "dance", c)) {
    const ranks = r >= 2 ? ["Alsó", "Felső", "Király", "Ász"] : ["Alsó", "Felső", "Király"];
    const called = m.deck.filter((x) => ranks.includes(x.rank)), rest = m.deck.filter((x) => !ranks.includes(x.rank));
    m.deck.splice(0, m.deck.length, ...rest, ...shuffled(rng, called));    // the top of the deck is its end
    if (called.length) matchSay(m, `Calling the Dance: ${called.length} face card${called.length === 1 ? "" : "s"} step up to the top of the deck.`);
  }
  ruralOnPlay(m, seat, c, me, rng, run);
  townsRuralOnPlay(m, seat, c, me, rng);
  agriOnPlay(m, seat, c, me, rng);
  forestOnPlay(m, seat, c, me, rng);
  hillOnPlay(m, seat, c, me, rng, run);
  fishOnPlay(m, seat, c, me, rng, run);
  // Hostile Takeover (Magnate): if its caravan holds strictly more coins than every other caravan when it's played, it counts as a
  // Seven for capture, with a Seven's advantages and limits; ties don't count; NPC locals aren't caravans (tok.md, D-190)
  if (TRADES.magnate(c) && m.richer && m.richer(seat) && once(m, "takeover", c)) { me.claimRank = "VII"; matchSay(m, "Hostile Takeover: the richest caravan's Magnate buys the claim like a Seven."); }
  if (ALT.weapons(c) && r >= 1 && once(m, "toarms", c)) m.trick.toArms = { team: seat % 2, face: r === 1, card: c };   // To Arms! (D-631)
  // Chain Reaction (Volatile Saltpetre line): Saltpetre the next allied card twice; Black Powder every later allied card twice;
  // Powder Keg also gives each allied card already in the trick one more resolution (D-633, D-634)
  if (ALT.saltpetre(c) && c.adjective === "Volatile" && !m.chainRun && once(m, "chain", c)) {
    m.trick.chain = r === 0 ? { team: seat % 2, next: true, card: c } : { team: seat % 2, card: c };
    if (r >= 2) { m.chainRun = true;
      try { for (const x of st.slice(0, st.indexOf(me))) if (x.seat % 2 === seat % 2 && !x.horizontal && !x.based && !x.tower && !x.inserted && !x.placed && !ALT.saltpetre(x.card)) run(m, x.seat, x.card, x); }
      finally { m.chainRun = false; } }
    matchSay(m, `Chain Reaction: ${r >= 2 ? "the keg goes up: your side's cards fire again" : "your side's next card" + (r ? "s fire twice" : " fires twice")}.`);
  }
  // Cheap Imitation (Coin Blanks: a basic copy of the card directly beneath; Counterfeit Coins: an exact copy of the card to
  // match); copied play abilities fire; the claim is the Coins' player's; reverts at the end of the trick (D-636, D-637)
  if (ALT.coins(c) && r >= 1 && !m.retrigger) {
    const tgt = r >= 2 ? bottomTarget(st) : st[st.indexOf(me) - 1];
    if (tgt && tgt !== me && !ALT.tools(tgt.card) && !frozen(st, me) && once(m, "imitation", c)) {
      const b = tgt.card; remember(me);
      if (r >= 2) { for (const k of ["suit", "rank", "refined", "adjective", "name", "roster"]) { if (b[k] === undefined) delete c[k]; else c[k] = b[k]; } }
      else { Object.assign(c, { suit: b.suit, rank: b.rank, roster: b.roster || "main" }); delete c.refined; delete c.adjective;
        const e = upgradeEntry(b), base = e ? e.stages[0] : COMMODITY_STAGES.find((x) => x.suit === b.suit && x.rank === b.rank && x.roster === (b.roster || "main") && x.stage === 0)?.name;
        if (base) c.name = base; else delete c.name; }
      matchSay(m, `Cheap Imitation: the coins pass for ${c.name || c.rank + " of " + c.suit}.`);
      m.retrigger = true; try { run(m, seat, c, me); } finally { m.retrigger = false; }
    }
  }
  // Silence (Poisoned Blade, Assassination Tools): played directly on a card, ends that card's ongoing ability (protections,
  // pending effects, restrictions it set); resolved effects stay and claims stand (D-638, D-641)
  if (ALT.dagger(c) && r >= 1) {
    const x = st[st.indexOf(me) - 1];
    if (x && !ALT.tools(x.card) && !frozen(st, x) && once(m, "silence", c)) {
      silence(m, x);
      matchSay(m, `Silence: the ${x.card.rank} of ${x.card.suit}'s ability is cut short.`);
    }
  }
  if (ALT.millet(c) && r >= 1 && once(m, "roots", c)) me.roots = r >= 2 ? "keep" : "pay";            // Stubborn Roots
  if (ALT.grapes(c) && r >= 1 && once(m, "ferment", c)) m.trick.ferment = { by: seat, chance: r >= 2 ? 0.5 : 0.25 };   // Fermentation
  if (ALT.sweet(c) && r === 1 && once(m, "revulsion", c)) m.trick.revulsion = { card: c };            // Revulsion
  if (ALT.sweet(c) && r >= 2 && once(m, "indulge", c)) m.trick.indulge = { team: seat % 2, card: c };   // Indulgence
  // Written Protection (Prepared Parchment, Fine Vellum): protects the claim held when it's played, if a Clergy card (not
  // itself) holds it; nothing otherwise (D-571)
  if (ALT.parchment(c) && r >= 1) {
    const cl = claimOf(st.slice(0, st.indexOf(me))), h = cl ? st[cl.index] : null;
    if (h && h.card.suit === "Clergy" && h !== me && once(m, "written", c)) { h.prot = { vellum: r >= 2, seat }; matchSay(m, "Written Protection: the Clergy claim is set down in writing."); }
  }
  // Divine Manifestation (Consecrated 50 %, Saint's 75 %): a random Ász (every suit, alternatives included; no mercenaries) at the
  // Reliquary's stage works its trick ability, then the card reverts; the claim is judged as the X (D-575)
  if (ALT.reliquary(c) && r >= 1 && !m.retrigger && !frozen(st, me) && once(m, "manifest", c)) {
    if (rng.next() < (r >= 2 ? 0.75 : 0.5)) {
      const pool = [...ASZ_SUITS.map((suit) => ({ suit, roster: "main" })), ...ASZ_ALTS], a = rng.pick(pool);
      remember(me);
      Object.assign(c, { suit: a.suit, rank: "Ász", refined: r, roster: a.roster }); delete c.adjective; if (a.name) c.name = a.name; else delete c.name;
      matchSay(m, `Divine Manifestation: for a moment the Reliquary is the ${a.name || a.suit + " Ász"}.`);
      m.retrigger = true; try { run(m, seat, c, me); } finally { m.retrigger = false; }
      restoreIdentities([me]);
    } else matchSay(m, "Divine Manifestation: nothing stirs.");
  }
}

// ---- rural Tradesfolk (tok-rural.md); trick abilities once per encounter (D-058, D-313)
const X_LINES = COMMODITY_STAGES.filter((x) => x.rank === "X" && x.stage === 0 && x.roster !== "secret alternative" && !(x.suit === "Tradesfolk" && x.roster === "rural roster"));
function ruralOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack, r = c.refined || 0;
  if (RURAL.guard(c) && once(m, "ward", c)) me.ward = true;                                        // Ward Off
  // Spillage (Cutlery: a basic Ironware; Tools: an exact copy) at a random position, the bottom included; no chain (D-544)
  if (RURAL.cutlery(c) && once(m, "spill", c)) {
    const { id, ref, ...rest } = c, copy = r >= 2 ? card(c.rank, c.suit, { ...rest, origin: "enc", generated: true }) : card("VIII", "Tradesfolk", { roster: "rural roster", name: "Ironware", origin: "enc", generated: true });
    const e = { seat, card: copy, copy: true, placed: true };
    const okPos = Array.from({ length: st.length + 1 }, (_, i) => i).filter((i) => canInsert(st, i));
    if (okPos.length) { const pos = choose(m, rng, okPos, (i) => { const o = st.slice(); o.splice(i, 0, e); return o; });
    st.splice(pos, 0, e); matchSay(m, "Spillage: a crate bursts and ironware scatters into the trick."); }
  }
  // Trade Opportunities (Resourceful rural IX): a basic VIII for the player's cargo; Chapman's Papers one per suit in the trick (D-546)
  if (RURAL.resourceful(c) && seat % 2 === 0 && once(m, "tradeop", c)) {
    const n = r >= 1 ? new Set(st.map((x) => x.card.suit)).size : 1, pool = COMMODITY_STAGES.filter((x) => x.rank === "VIII" && x.stage === 0 && x.roster !== "secret alternative");
    for (let k = 0; k < n; k++) { const v = rng.pick(pool); m.generated.push({ rank: "VIII", suit: v.suit, roster: v.roster, name: v.name }); }
    matchSay(m, `Trade Opportunities: ${n} good${n === 1 ? "" : "s"} for your cargo after the match.`);
  }
  // Opening the Dowry (Painted Chest; Bridal Chest also works the X's trick): for the trick it becomes a random X (any but the
  // Chest's own line, alternatives included), keeping its stage and adjective level (D-549, D-550)
  if (RURAL.painted(c) && !m.retrigger && !frozen(st, me) && once(m, "dowry", c)) {
    const line = rng.pick(X_LINES); let st2 = line, base = null;
    for (const x of COMMODITY_STAGES) { if (x.stage === 0) base = x.name; if (base === line.name && x.suit === line.suit && x.rank === "X" && x.roster === line.roster && x.stage === r) { st2 = x; break; } }
    remember(me); const hadAdj = !!c.adjective;
    Object.assign(c, { suit: line.suit, rank: "X", roster: line.roster, name: st2.name }); delete c.adjective;
    const e = upgradeEntry(c); if (hadAdj && e && e.adjective) c.adjective = e.adjective;
    matchSay(m, `Opening the Dowry: inside the chest, ${c.name}.`);
    if (r >= 2) { m.retrigger = true; try { run(m, seat, c, me); } finally { m.retrigger = false; } }
  }
  // Learning the Trade (Merchant's Apprentice): a random Felső of the encounter's suits (checkpoints: King's Men) lends its trick
  // ability at the Alsó's own level; claims stay the Alsó's (D-532, D-534, D-366). Reading: the ability works as played, then
  // the card is the Alsó again, so Felső abilities that act at the trick's end don't carry over
  if (RURAL.apprentice(c) && !m.retrigger && !frozen(st, me) && once(m, "learn", c)) {
    const suits = m.kind === "checkpoint" ? ["King's Men"] : (m.suits || [...new Set(m.deck.map((x) => x.suit))]);
    if (suits.length) { const su = rng.pick(suits); remember(me);
      Object.assign(c, { suit: su, rank: "Felső", roster: "main", refined: r }); delete c.name; const e = upgradeEntry(c); if (c.adjective) c.adjective = e?.adjective;
      matchSay(m, `Learning the Trade: the apprentice works like a ${su} Felső.`);
      m.retrigger = true; try { run(m, seat, c, me); } finally { m.retrigger = false; }
      restoreIdentities([me]); }
  }
  // Claim Suppression (Court Merchant): cards beneath worth less (card value, D-539) lose and can't establish claims, until the
  // trick ends or another claimant is played on top; the Mercer takes the claim if none is left; 1 coin per claim cut (D-538, D-539)
  if (RURAL.court(c) && once(m, "suppress", c)) {
    const v = m.value ? m.value(c) : 0, low = st.slice(0, st.indexOf(me)).filter((x) => (m.value ? m.value(x.card) : 0) < v);
    const before = claimOf(st.slice(0, st.indexOf(me))), claimants = low.filter((x, i) => x === st[0] || x.card.rank === st[0].card.rank || x.card.rank === "VII").length;
    for (const x of low) x.cut = me;
    if (seat % 2 === 0 && claimants) { m.coins += claimants; matchSay(m, `Claim Suppression: ${claimants} claim${claimants === 1 ? "" : "s"} cut, ${claimants} coin${claimants === 1 ? "" : "s"}.`); }
    else matchSay(m, "Claim Suppression: the Court Merchant looks down on the cheaper cards.");
    void before;
  }
  // The Peddler's Here! (Covered Wagon: the last player; Kocsi: all three others): their most recent card in the trick is swapped
  // for a random strictly higher card from their hand, which isn't played (no ability); the card goes back to the hand (D-551, D-552)
  if (RURAL.wagon(c) && once(m, "peddler", c)) {
    const prevSeat = st.length >= 2 ? st[st.indexOf(me) - 1]?.seat : null;
    const who = r >= 2 ? [1, 2, 3].map((k) => (seat + k) % 4) : (prevSeat != null && prevSeat !== seat ? [prevSeat] : []);
    for (const s2 of who) {
      const mine = [...st].reverse().find((x) => x.seat === s2 && x !== me && !x.tower && !x.inserted); if (!mine) continue;
      const up = m.hands[s2].filter((x) => RANK_ORDER.indexOf(x.rank) > RANK_ORDER.indexOf(mine.card.rank)); if (!up.length) continue;
      const pick = choose(m, rng, up, (x) => st.map((y) => (y === mine ? { ...y, card: x } : y)));
      m.hands[s2].splice(m.hands[s2].indexOf(pick), 1, mine.card); mine.card = pick; mine.placed = true;
      matchSay(m, `The Peddler's Here! ${m.names[s2]} can't resist and puts down the ${pick.rank} of ${pick.suit} instead.`);
    }
  }
}

// ---- Carnivalfolk (carnival.md)
function carnivalOnPlay(m, seat, c, me, rng) {
  const st = m.trick.stack;
  // Crowd Pleaser (Sword Swallower): taking a claim pays 1 coin per non-Carnivalfolk card in the stack (player's side tracked)
  if (CARNIVAL.swallower(c) && claimOf(st).index === st.indexOf(me)) {
    const n = st.filter((x) => x.card.suit !== "Carnivalfolk").length;
    if (seat % 2 === 0 && n) { m.coins += n; matchSay(m, `Crowd Pleaser: the crowd throws ${n} coin${n === 1 ? "" : "s"}.`); }
  }
  // Hear Ye! (Herald): a suit of the location's four (not Carnivalfolk); everyone after must follow it if able, until play
  // comes back to the Herald's player
  if (CARNIVAL.herald(c)) {
    const pool = (m.suits || [...new Set([...m.deck, ...m.hands.flat()].filter((x) => x.origin === "enc").map((x) => x.suit))]).filter((x) => x !== "Carnivalfolk");
    if (pool.length) { m.hearYe = { suit: rng.pick(pool), by: seat, card: c }; matchSay(m, `Hear Ye! Everyone plays ${m.hearYe.suit} if they can.`); }
  }
  // Right of Way (Dazzling IX): the next player must play a suit other than the card beneath the Travel Pass, if able
  if (CARNIVAL.dazzling(c) && st.length >= 2 && st[st.length - 2] !== me) { m.rightOfWay = { suit: st[st.length - 2].card.suit, by: seat, card: c }; matchSay(m, `Right of Way: no ${m.rightOfWay.suit} next.`); }
  // Intimidation (Trained Bear: the next player; Dancing Bear: everyone until play returns): play one of your most valuable cards
  if (CARNIVAL.bear(c)) { m.intimidate = { by: seat, once: c.refined < 2, card: c }; matchSay(m, `Intimidation: the bear growls; ${c.refined < 2 ? "the next player plays" : "everyone plays"} their most valuable card.`); }
  // Fool's Gold (Jester 1, Court Jester 2): random cards in every other hand look like Jesters until played
  if (CARNIVAL.jester(c)) {
    for (const s2 of [0, 1, 2, 3].filter((x) => x !== seat)) {
      const h = m.hands[s2].filter((x) => !x.jesterGuise);
      for (let k = 0; k < Math.min(c.refined >= 2 ? 2 : 1, h.length); k++) h.splice(Math.floor(rng.next() * h.length), 1)[0].jesterGuise = true;
    }
    matchSay(m, "Fool's Gold: some cards in every hand now look like Jesters.");
  }
}

// ---- Townsfolk (urban.md)
const once = (m, key, c) => { if (m.chainRun) return true; m.onceUsed ??= new Set(); const k = key + ":" + c.id; if (m.onceUsed.has(k)) return false; m.onceUsed.add(k); return true; };
const VIII_SUITS = [...new Set(COMMODITY_STAGES.filter((x) => x.rank === "VIII" && x.roster === "main").map((x) => x.suit))];
function townsfolkOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack, opp = [1, 3].map((k) => (seat + k) % 4);
  if (TOWNS.constable(c)) me.noFunny = true;
  // Guiding Light (Wax Candles 1, Beeswax Candles 2): random cards from an opponent's hand, shown to the player's team
  if (TOWNS.candles(c)) {
    const who = opp.filter((s) => m.hands[s].length); if (who.length) {
      const s = rng.pick(who), hand = m.hands[s].slice(), shown = [];
      for (let k = 0; k < Math.min(c.refined >= 2 ? 2 : 1, hand.length); k++) shown.push(hand.splice(Math.floor(rng.next() * hand.length), 1)[0]);
      matchSay(m, seat % 2 === 0 ? `Guiding Light: ${m.names[s]} holds ${shown.map((x) => `${x.rank} of ${x.suit}`).join(" and ")}.`
                                 : `Guiding Light: the rivals see ${shown.length} of ${s === 0 ? "your" : m.names[s] + "'s"} cards.`);
    }
  }
  // Home Advantage (Established Townsfolk IX): claims as the rank of the card directly beneath, fixed at play; once per encounter
  if (TOWNS.established(c) && st.length >= 2 && st[st.length - 2] !== me && once(m, "home", c)) {
    me.claimRank = st[st.length - 2].card.rank; matchSay(m, `Home Advantage: the Residence Permit claims as a ${me.claimRank}.`);
  }
  // Lost Socks (Fine Wine: you and your partner swap one encounter card; Spiced Wine: one from each player, nobody keeps
  // their own); once per encounter
  if (TOWNS.wine(c) && once(m, "socks", c)) {
    const encOf = (s) => m.hands[s].filter((x) => x.origin === "enc");
    const seats = c.refined >= 2 ? [0, 1, 2, 3].filter((s) => encOf(s).length) : [seat, (seat + 2) % 4].filter((s) => encOf(s).length);
    if (seats.length >= 2) {
      const taken = seats.map((s) => { const x = rng.pick(encOf(s)); m.hands[s].splice(m.hands[s].indexOf(x), 1); return x; });
      seats.forEach((s, k) => m.hands[s].push(taken[(k + 1) % seats.length]));   // a rotation: nobody gets their own back
      matchSay(m, `Lost Socks: ${seats.length} cards change hands.`);
    }
  }
  // Another Round! (Tavern Keeper): the next player plays one extra card into this trick; once per encounter
  if (TOWNS.keeper(c) && once(m, "round", c)) { m.trick.anotherRound = seat; matchSay(m, "Another Round!"); }
  // Tall Tales (Bard): the next card on top of the Bard looks like a random card to everyone else; once per encounter
  if (TOWNS.bard(c) && once(m, "tales", c)) me.tallTales = true;
  // Market Day! (Mayor): two random rank VIII commodities (three with Pompous) on top of the trick, random suit and stage;
  // their on-play abilities trigger; capturable spoils
  if (TOWNS.mayor(c)) {
    const n = c.adjective === "Pompous" ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const suit = rng.pick(VIII_SUITS), stage = Math.floor(rng.next() * 3);
      const v = COMMODITY_STAGES.filter((x) => x.suit === suit && x.rank === "VIII" && x.stage === stage && x.roster === "main");
      const g = card("VIII", suit, { origin: "enc", generated: true, ...(stage ? { refined: stage } : {}), ...(v.length ? { name: v[0].name } : {}) });
      st.push({ seat, card: g }); run(m, seat, g);
    }
    matchSay(m, `Market Day! ${n} goods pile onto the trick.`);
  }
  // Erection (Master Builder; Royal Architect also refines one of them): four encounter-deck cards face-down on top; no
  // claims, no abilities; the winner takes them; once per encounter; needs four cards in the deck (D-525)
  if (TOWNS.builder(c) && m.deck.length >= 4 && once(m, "tower", c)) {
    const tower = []; for (let k = 0; k < 4; k++) tower.push(m.deck.splice(Math.floor(rng.next() * m.deck.length), 1)[0]);
    for (const x of tower) st.push({ seat, card: x, tower: true });
    if (c.refined >= 2) { const el = tower.filter((x) => (x.rank === "VIII" || x.rank === "X") && (x.refined || 0) < 2); if (el.length) { const x = rng.pick(el); x.refined = (x.refined || 0) + 1; } }
    matchSay(m, `Erection: a tower of four cards rises on the trick${c.refined >= 2 ? " (one good refined)" : ""}.`);
  }
}

const isFarm = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Farmfolk" && card.rank === rank;
const isClergy = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Clergy" && card.rank === rank;
const FACE3 = new Set(["Alsó", "Felső", "Király"]);
export const CLERGY = {
  fanatic: (c) => isClergy(c, "VII") && (c.refined || 0) >= 1,            // Fanatic
  undying: (c) => isClergy(c, "VII") && c.adjective === "Undying",        // Resurrection
  remedies: (c) => isClergy(c, "VIII") && (c.refined || 0) >= 1,          // Second Chance: 25 %, Potent Medicines 50 %
  restorative: (c) => isClergy(c, "VIII") && !!c.adjective,               // Field Medicine (Restorative, any stage; D-651)
  revered: (c) => isClergy(c, "X") && c.adjective === "Revered",          // Sacred Teachings (personal deck)
  proselytising: (c) => isClergy(c, "X") && (c.refined || 0) >= 1,       // +1 / +2 face cards for Conversion
  disciple: (c) => isClergy(c, "Alsó") && (c.refined || 0) >= 1,         // Pilgrim's Offering
  fervent: (c) => isClergy(c, "Alsó") && c.adjective === "Fervent",      // Pilgrimage (personal deck)
  evangelist: (c) => isClergy(c, "Felső") && (c.refined || 0) >= 1,      // Conversion
  esteemed: (c) => isClergy(c, "Felső") && c.adjective === "Esteemed",   // Patronage (personal deck)
  militant: (c) => isClergy(c, "Király") && c.adjective === "Militant",  // Holy Host (personal deck)
  echo: (c) => isClergy(c, "Ász") && (c.refined || 0) >= 1,              // Echo of Fate: Holywoman base copy, Oracle perfect copy
  radiant: (c) => isClergy(c, "Ász") && c.adjective === "Radiant" && (c.refined || 0) >= 1,   // Checkpoint Influence (Holywoman on; personal deck)
  face: (c) => c.suit === "Clergy" && FACE3.has(c.rank),                  // Clergy face cards for Patronage and Holy Host
};

const isTrades = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Tradesfolk" && card.rank === rank;
export const TRADES = {
  imposing: (c) => isTrades(c, "VII") && c.adjective === "Imposing",          // 1.5 Sevens of military (cargo or personal deck)
  cloth: (c) => isTrades(c, "VIII") && (c.refined || 0) >= 1,                  // Merchant's Cut 5 %, Brocade 10 %
  papers: (c) => isTrades(c, "IX") && (c.refined || 0) >= 1,                   // Trading Advantage (personal deck)
  enterprising: (c) => isTrades(c, "IX") && c.adjective === "Enterprising",    // Commodity Exchange
  bait: (c) => isTrades(c, "X") && (c.refined || 0) >= 1,                      // Gilded Bait: its value, Amulet twice
  coveted: (c) => isTrades(c, "X") && c.adjective === "Coveted",               // Bribery (cargo)
  journeyman: (c) => isTrades(c, "Alsó") && (c.refined || 0) >= 1,             // Apprenticeship
  industrious: (c) => isTrades(c, "Alsó") && c.adjective === "Industrious",    // Cheap Labour (personal deck)
  master: (c) => isTrades(c, "Felső") && (c.refined || 0) >= 1,                // Craftsmanship
  diligent: (c) => isTrades(c, "Felső") && c.adjective === "Diligent",         // Master Craftsmanship (personal deck)
  ruthless: (c) => isTrades(c, "Király") && c.adjective === "Ruthless",        // Hired Swords (personal deck)
  magnate: (c) => isTrades(c, "Király") && (c.refined || 0) >= 1,              // Hostile Takeover (needs other caravans)
  courtesan: (c) => isTrades(c, "Ász") && (c.refined || 0) >= 1,               // Distraction (Royal Mistress also the card above)
  enticing: (c) => isTrades(c, "Ász") && c.adjective === "Enticing",           // Special Treatment 5 / 10 / 15 % (personal deck)
};
const SUITS12 = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Beasts", "Bandits", "Townsfolk", "King's Men", "Hillfolk", "Carnivalfolk", "Fisherfolk", "Plainsfolk"];
// a suit change takes the card's main-roster identity of the new suit at the same stage, and drops any Merchant's Cut (D-274)
export function setSuit(c, suit) {
  c.suit = suit; delete c.cutPct; c.roster = "main";
  const st = COMMODITY_STAGES.find((x) => x.suit === suit && x.rank === c.rank && x.roster === "main" && x.stage === (c.refined || 0));
  if (st) c.name = st.name; else delete c.name;
}

// the rural Tradesfolk roster (tok-rural.md)
const isRural = (c, rank) => c.roster === "rural roster" && c.suit === "Tradesfolk" && c.rank === rank;
export const RURAL = {
  guard: (c) => isRural(c, "VII") && (c.refined || 0) >= 1, local: (c) => isRural(c, "VII") && c.adjective === "Local",
  cutlery: (c) => isRural(c, "VIII") && (c.refined || 0) >= 1, essential: (c) => isRural(c, "VIII") && c.adjective === "Essential",
  chapman: (c) => isRural(c, "IX") && (c.refined || 0) >= 1, resourceful: (c) => isRural(c, "IX") && c.adjective === "Resourceful",
  painted: (c) => isRural(c, "X") && (c.refined || 0) >= 1, surprising: (c) => isRural(c, "X") && c.adjective === "Surprising",
  apprentice: (c) => isRural(c, "Alsó") && (c.refined || 0) >= 1, hardworking: (c) => isRural(c, "Alsó") && c.adjective === "Hardworking",
  merchant: (c) => isRural(c, "Felső") && (c.refined || 0) >= 1, crafty: (c) => isRural(c, "Felső") && c.adjective === "Crafty",
  court: (c) => isRural(c, "Király") && (c.refined || 0) >= 1, haughty: (c) => isRural(c, "Király") && c.adjective === "Haughty",
  wagon: (c) => isRural(c, "Ász") && (c.refined || 0) >= 1, wandering: (c) => isRural(c, "Ász") && c.adjective === "Wandering",
};
// the rural Townsfolk roster (townsfolk-rural.md; D-606 to D-628)
const isVillage = (c, rank) => c.roster === "rural roster" && c.suit === "Townsfolk" && c.rank === rank;
export const RURAL_T = {
  bellman: (c) => isVillage(c, "VII") && (c.refined || 0) >= 1, untrained: (c) => isVillage(c, "VII") && c.adjective === "Unpredictable",
  dough: (c) => isVillage(c, "VIII") && (c.refined || 0) >= 1, bread: (c) => isVillage(c, "VIII") && (c.refined || 0) >= 2,
  hearty: (c) => isVillage(c, "VIII") && c.adjective === "Hearty",
  permit: (c) => isVillage(c, "IX") && (c.refined || 0) >= 1, unremarkable: (c) => isVillage(c, "IX") && c.adjective === "Unremarkable",
  stitched: (c) => isVillage(c, "X") && (c.refined || 0) >= 1,
  herbalist: (c) => isVillage(c, "Alsó") && (c.refined || 0) >= 1, tireless: (c) => isVillage(c, "Alsó") && c.adjective === "Tireless",
  miller: (c) => isVillage(c, "Felső") && (c.refined || 0) >= 1, gruelling: (c) => isVillage(c, "Felső") && c.adjective === "Gruelling",
  judge: (c) => isVillage(c, "Király") && (c.refined || 0) >= 1, judicious: (c) => isVillage(c, "Király") && c.adjective === "Judicious",
  proud: (c) => isVillage(c, "Ász") && (c.refined || 0) >= 1, starEyed: (c) => isVillage(c, "Ász") && (c.refined || 0) >= 2,
  indomitable: (c) => isVillage(c, "Ász") && c.adjective === "Indomitable",
};
// ---- Forestfolk (zold.md; two-track D-650, D-651) and its alternatives (Willow D-590, Beaver D-591, D-593)
const isForest = (c, rank) => (!c.roster || c.roster === "main") && c.suit === "Forestfolk" && c.rank === rank;
export const FOREST = {
  ranger: (c) => isForest(c, "VII") && (c.refined || 0) >= 1, wily: (c) => isForest(c, "VII") && c.adjective === "Wily",
  cured: (c) => isForest(c, "VIII") && (c.refined || 0) >= 1, thick: (c) => isForest(c, "VIII") && c.adjective === "Thick",
  papers: (c) => isForest(c, "IX") && (c.refined || 0) >= 1, woodswise: (c) => isForest(c, "IX") && c.adjective === "Woodswise",
  blackTruffles: (c) => isForest(c, "X") && (c.refined || 0) >= 1, alluring: (c) => isForest(c, "X") && c.adjective === "Alluring",
  trapper: (c) => isForest(c, "Alsó") && (c.refined || 0) >= 1, hardy: (c) => isForest(c, "Alsó") && c.adjective === "Hardy",
  forester: (c) => isForest(c, "Felső") && (c.refined || 0) >= 1, steady: (c) => isForest(c, "Felső") && c.adjective === "Steady",
  huntmaster: (c) => isForest(c, "Király") && (c.refined || 0) >= 1, noble: (c) => isForest(c, "Király") && c.adjective === "Noble",
  huntingHorn: (c) => isForest(c, "Ász") && (c.refined || 0) >= 1, commanding: (c) => isForest(c, "Ász") && c.adjective === "Commanding",
  willow: (c) => c.roster === "alternative" && c.suit === "Forestfolk" && c.rank === "VIII" && lineBase(c) === "Willow Branches",
  beaver: (c) => c.roster === "alternative" && c.suit === "Forestfolk" && c.rank === "X" && lineBase(c) === "Beaver Pelt",
};
const FOREST_BASE = { VII: "Poacher", IX: "Travel Pass", "Alsó": "Forager", "Felső": "Hunter", "Király": "Baron", "Ász": "Horn" };
function forestOnPlay(m, seat, c, me, rng) {
  const st = m.trick.stack, t = m.trick, side = seat % 2, r = c.refined || 0, i = st.indexOf(me), below = st[i - 1];
  // Disguise (Ranger): for the trick it is a Forestfolk Alsó in every respect, upgrades kept; reverts at the trick's end (D-193, D-209)
  if (FOREST.ranger(c) && !frozen(st, me) && once(m, "disguise", c)) { remember(me); c.rank = "Alsó"; matchSay(m, "Disguise: the Ranger passes for a Forestfolk Alsó."); }
  // False Claim (Cured Hides; Leather also against a Seven): played directly on the current claimant whose claim isn't a Seven's or a
  // matching rank's, that claim is cancelled; authority falls back; the Archbishop's protection holds (D-243, D-270, D-651)
  if (FOREST.cured(c) && below && once(m, "falseclaim", c)) {
    const cl = claimOf(st.slice(0, i)), ok = cl && st[cl.index] === below && cl.reason !== "Ecclesiastical Authority"
      && (!["matching rank", "led card", "Seven", "Herd Guard"].includes(cl.reason) || (r >= 2 && below.card.rank === "VII" && cl.reason !== "matching rank"));
    if (ok) { below.falseClaim = true; matchSay(m, `False Claim: the ${below.card.name || below.card.rank + " of " + below.card.suit}'s claim is exposed as false.`); }
  }
  // Lost in the Woods (Woodswise IX): the card to match and the claimant are hidden from everyone until the claim next changes (D-247, D-277)
  if (FOREST.woodswise(c) && once(m, "lost", c)) { const cl = claimOf(st); t.lost = { index: cl ? cl.index : -1, entry: cl ? st[cl.index] : null }; matchSay(m, "Lost in the Woods: a camouflage net drops over the table."); }
  // Alluring Scent (Alluring X): 50 % a Tusker, a neutral fifth participant, joins the trick and rampages (D-187, D-211, D-308)
  if (FOREST.alluring(c) && once(m, "scent", c)) {
    if (rng.next() < 0.5) {
      const tusk = { seat: -1, neutral: true, placed: true, card: card("VII", "Beasts", { refined: 1, name: "Tusker", origin: "enc", generated: true }) };
      st.push(tusk); m.names[-1] = "the Tusker"; matchSay(m, "Alluring Scent: a Tusker crashes out of the undergrowth!");
      m.trick.tuskerRampage = true;
    } else matchSay(m, "Alluring Scent: nothing takes the bait (50%).");
  }
  // Set Trap (Trapper): at the end of the trick, before the award, the top two cards swap; several Trappers in play order (D-650)
  if (FOREST.trapper(c)) (t.endHooks ??= []).push((mm) => {
    const s2 = mm.trick.stack, n = s2.length;
    if (n >= 2 && !(n === 2 && s2[0].insulated) && !frozen(s2, s2[n - 1]) && !frozen(s2, s2[n - 2]) && !bound(s2, s2[n - 1], true) && !bound(s2, s2[n - 2], true)) {
      [s2[n - 1], s2[n - 2]] = [s2[n - 2], s2[n - 1]]; matchSay(mm, "Set Trap: the top two cards are swapped.");
    }
  });
  // Hunting Orders (Huntmaster): the bottom card becomes a random base Forestfolk card, any rank, for the trick (D-209)
  if (FOREST.huntmaster(c) && st[0] && st[0] !== me && once(m, "orders", c)) {
    const b = bottomTarget(st);
    if (!frozen(st, b) && !ALT.tools(b.card) && !insulated(b)) {
      const rank = choose(m, rng, ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"], (rk) => [{ ...b, card: { ...b.card, rank: rk } }, ...st.slice(1)]);
      const name = FOREST_BASE[rank] || rng.pick(COMMODITY_STAGES.filter((x) => x.suit === "Forestfolk" && x.rank === rank && x.stage === 0)).name;
      remember(b); Object.assign(b.card, { suit: "Forestfolk", rank, roster: COMMODITY_STAGES.find((x) => x.name === name)?.roster || "main", name });
      delete b.card.refined; delete b.card.adjective;
      matchSay(m, `Hunting Orders: the card to match is now a ${name} (Forestfolk ${rank}).`);
    }
  }
  // Wolf Summoning (Hunting Horn: an Alpha into your hand; Horn of Nimród: and another into the trick, at the top, a random inner place
  // or just above the bottom card, a third each); hand Alphas vanish at the encounter's end (D-650)
  if (FOREST.huntingHorn(c) && once(m, "wolves", c)) {
    const alpha = () => card("Alsó", "Beasts", { refined: 1, name: "Alpha", origin: "enc", generated: true });
    m.hands[seat].push(Object.assign(alpha(), { summoned: true }));
    if (r >= 2) {
      const n = st.length, where = rng.pick(["top", "inner", "low"]), pos = where === "top" ? n : where === "low" ? 1 : 1 + Math.floor(rng.next() * Math.max(1, n - 1));
      if (canInsert(st, pos)) st.splice(pos, 0, { seat, card: alpha(), placed: true });
    }
    matchSay(m, r >= 2 ? "Wolf Summoning: the horn calls the pack: an Alpha to your hand, another into the trick." : "Wolf Summoning: an Alpha answers the horn.");
  }
  // Entanglement (Willow Withies / Wicker Bundles): binds the card directly beneath (D-590, D-593)
  if (FOREST.willow(c) && r >= 1 && below && once(m, "entangle", c)) { me.binds = { target: below, full: r >= 2 }; matchSay(m, "Entanglement: the willow binds the card beneath it."); }
  // Tempting (Tempting Beaver line): every later card that would take the claim this trick may go for the Beaver instead: 10 / 25 / 50 %
  // (D-591, D-593)
  if (FOREST.beaver(c) && c.adjective === "Tempting" && once(m, "tempt", c)) t.tempt = { chance: [0.1, 0.25, 0.5][r], card: c, entry: me };
}
// ---- Hillfolk (hillfolk.md; two-track D-650, D-652, D-656, D-619) and its alternatives (Salt D-580, Copper D-584, Silver and Gold D-587)
const isHill = (c, rank) => (!c.roster || c.roster === "main") && c.suit === "Hillfolk" && c.rank === rank;
const isHillAlt = (c, rank, line) => c.roster === "alternative" && c.suit === "Hillfolk" && c.rank === rank && lineBase(c) === line;
export const HILL = {
  oreSeeker: (c) => isHill(c, "Alsó") && (c.refined || 0) >= 1, keen: (c) => isHill(c, "Alsó") && c.adjective === "Keen",
  steelmaker: (c) => isHill(c, "Felső") && (c.refined || 0) >= 1, thrifty: (c) => isHill(c, "Felső") && c.adjective === "Thrifty",
  chamberlain: (c) => isHill(c, "Király") && (c.refined || 0) >= 1, affluent: (c) => isHill(c, "Király") && c.adjective === "Affluent",
  arbalester: (c) => isHill(c, "VII") && (c.refined || 0) >= 1, vigilant: (c) => isHill(c, "VII") && c.adjective === "Vigilant",
  magnetic: (c) => isHill(c, "VIII") && c.adjective === "Magnetic", iron: (c) => isHill(c, "VIII") && (c.refined || 0) >= 1,
  smiths: (c) => isHill(c, "IX") && (c.refined || 0) >= 1, discerning: (c) => isHill(c, "IX") && c.adjective === "Discerning",
  fineShoe: (c) => isHill(c, "X") && (c.refined || 0) >= 1,
  hermit: (c) => isHill(c, "Ász") && (c.refined || 0) >= 1, ascetic: (c) => isHill(c, "Ász") && c.adjective === "Ascetic",
  salt: (c) => isHillAlt(c, "VIII", "Rock Salt"), preserving: (c) => isHillAlt(c, "VIII", "Rock Salt") && c.adjective === "Preserving",
  copper: (c) => isHillAlt(c, "VIII", "Copper Ore"), tempering: (c) => isHillAlt(c, "VIII", "Copper Ore") && c.adjective === "Malleable",
  silver: (c) => isHillAlt(c, "X", "Silver Ore"), gold: (c) => isHillAlt(c, "X", "Gold Ore"),
};
const isCommodityCard = (c) => c.rank === "VIII" || c.rank === "X";
// does a card have an ability Jurisdiction can retrigger? (an upgraded card; unupgraded cards have none, D-647)
const hasAbility = (c) => !!((c.refined || 0) > 0 || c.adjective);
function hillOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack, t = m.trick, side = seat % 2, r = c.refined || 0, i = st.indexOf(me), below = st[i - 1];
  // Upheaval (Ore Seeker): a random card from beneath the top goes to the top (D-652)
  if (HILL.oreSeeker(c) && st.length > 1 && once(m, "upheaval", c)) {
    const el = st.slice(0, -1).filter((x) => movable(st, x) && !ALT.tools(x.card));
    if (el.length) { const x = choose(m, rng, el, (y) => [...st.filter((z) => z !== y), y]); st.splice(st.indexOf(x), 1); st.push(x); matchSay(m, `Upheaval: the ${x.card.rank} of ${x.card.suit} is thrown up to the top.`); }
  }
  // Outfitting (Steelmaker): the next allied Hillfolk card claims as a Seven (D-650)
  if (HILL.steelmaker(c) && once(m, "outfit", c)) t.outfit = { team: side, card: c };
  // Jurisdiction (Chamberlain): the last Hillfolk card beneath acts again, whoever's it is, and its player gets 2 coins; nothing
  // without one, or if it has no ability (explicit retrigger, D-313)
  if (HILL.chamberlain(c) && once(m, "jurisdiction", c)) {
    const x = st.slice(0, i).reverse().find((y) => y.card.suit === "Hillfolk" && !y.placed && !y.inserted);
    if (x && hasAbility(x.card)) {
      m.chainRun = true; try { run(m, x.seat, x.card, x); } finally { m.chainRun = false; }
      if (side === 0) m.coins += 2; matchSay(m, `Jurisdiction: the ${x.card.name || x.card.rank + " of Hillfolk"} acts again${side === 0 ? "; 2 coins" : ""}.`);
    } else matchSay(m, "Jurisdiction: no Hillfolk card to rule on.");
  }
  // Covering Fire (Arbalester): the next time an allied Hillfolk card would lose its claim to anything but a matching-rank capture
  // (Sevens included), it keeps it; once per encounter; Jurisdiction can retrigger it (D-652, D-908)
  if (HILL.arbalester(c) && once(m, "cover", c)) t.cover = { team: side, card: c };
  // Scrap Metal (Magnetic Hillfolk VIII line): played with an allied Hillfolk card already in the trick: 1 coin
  if (HILL.magnetic(c) && side === 0 && st.slice(0, i).some((x) => x.seat % 2 === side && x.card.suit === "Hillfolk") && once(m, "scrap", c)) { m.coins += 1; matchSay(m, "Scrap Metal: 1 coin from the offcuts."); }
  // Authentication (Discerning IX): a Hillfolk X played in the same round: 30 % an exact copy of it for the IX player's cargo
  if (HILL.discerning(c) || (c.suit === "Hillfolk" && c.rank === "X")) {
    const round = t.rounds || 1, pass = HILL.discerning(c) ? me : st.find((x) => x.round === round && HILL.discerning(x.card) && x.seat % 2 === 0);
    const xx = c.suit === "Hillfolk" && c.rank === "X" ? me : st.find((x) => x.round === round && x.card.suit === "Hillfolk" && x.card.rank === "X");
    if (pass && xx && pass.seat % 2 === 0 && once(m, "authenticate", pass.card)) {
      if (rng.next() < 0.3) { const { id, ref, origin, ownerSeat, own, ...rest } = xx.card; m.generated.push({ ...rest }); matchSay(m, `Authentication: a certified copy of the ${xx.card.name || "Hillfolk X"} for your cargo.`); }
      else matchSay(m, "Authentication: the papers don't match this time (30%).");
    }
  }
  // Final Nail (Fine Horseshoe: on an X; Masterwork: on a VII or X): the trick ends at the end of this round (D-656)
  if (HILL.fineShoe(c) && below && (below.card.rank === "X" || (r >= 2 && below.card.rank === "VII")) && once(m, "nail", c)) { t.roundRule = { kind: "stop", card: c }; matchSay(m, "Final Nail: this round is the trick's last."); }
  // Forewarning (Hermit: allied Hillfolk; Sage: any): if the trick goes into another round, at that round's end every such Hillfolk
  // card above the card to match moves to the top, in random order (D-652)
  if (HILL.hermit(c) && once(m, "forewarn", c)) { const round = t.rounds || 1, team = r >= 2 ? null : side;
    (t.roundEnd ??= []).push((mm) => {
      if (mm.trick.rounds !== round + 1) return false;
      const s2 = mm.trick.stack, up = s2.slice(1).filter((x) => x.card.suit === "Hillfolk" && (team === null || team2(x.seat) === team) && movable(s2, x));   // Dead Weight, Entanglement, Stubborn hold
      if (up.length) { s2.splice(0, s2.length, ...s2.filter((x) => !up.includes(x)), ...shuffled(rng, up)); matchSay(mm, "Forewarning: the Hillfolk heed the warning and gather at the top."); }
      return true;
    }); }
  // Salting (Crushed Salt: after its ability; Refined Salt: before, so none): an opposing commodity played directly on the Salt that
  // takes the Salt side's claim becomes a basic Rock Salt for the trick (D-580 to D-582, D-654)
  // (handled around the incoming card's play in the wrapper)
  // Malleable (Copper: on a IX or X card to match, a basic Hillfolk IX / X; Copper Sheets: a basic Hillfolk VII) for the trick (D-584, D-654)
  if (HILL.copper(c) && r >= 1 && !frozen(st, me) && once(m, "malleable", c)) {
    const tr = r >= 2 ? "VII" : st[0] && st[0] !== me && ["IX", "X"].includes(st[0].card.rank) ? st[0].card.rank : null;
    if (tr) {
      const name = tr === "VII" ? "Crossbowman" : tr === "IX" ? "Travel Pass" : rng.pick(COMMODITY_STAGES.filter((x) => x.suit === "Hillfolk" && x.rank === "X" && x.stage === 0)).name;
      remember(me); Object.assign(c, { rank: tr, name, roster: tr === "X" ? COMMODITY_STAGES.find((x) => x.name === name).roster : "main" }); delete c.refined; delete c.adjective;
      matchSay(m, `Malleable: the copper is hammered into a ${name}.`);
    }
  }
  // Let It Ride (Refined Silver: the caller must start another round; Ingots: +1 coin per round) / Cash Out (Refined Gold: no other
  // round; Ingots: 10 coins - 1 per round); the later card decides; coins at the trick's end (D-587, D-588)
  if ((HILL.silver(c) || HILL.gold(c)) && r >= 1 && once(m, "metal", c)) {
    const silver = HILL.silver(c);
    t.roundRule = { kind: silver ? "force" : "stop", card: c };
    if (r >= 2) (t.ingots ??= []).push({ seat, silver });
    matchSay(m, silver ? "Let It Ride: the caller must play another round." : "Cash Out: this round is the trick's last.");
  }
}
// the Salting check for a commodity played directly on a Salt (before: Refined Salt; after: Crushed Salt)
function salting(m, me, before) {
  const st = m.trick.stack, i = st.indexOf(me), salt = st[i - 1];
  if (!salt || !HILL.salt(salt.card) || !(salt.card.refined >= 1) || (salt.card.refined >= 2) !== before || salt.based || salt.silenced || !isCommodityCard(me.card)) return false;
  if (team2(me.seat) === team2(salt.seat) || frozen(st, me)) return false;
  const was = claimOf(st.slice(0, i)), now = claimOf(st);
  if (!was || was.team !== team2(salt.seat) || !now || now.team === was.team || !once(m, "salting", salt.card)) return false;
  remember(me); Object.assign(me.card, { suit: "Hillfolk", rank: "VIII", roster: "alternative", name: "Rock Salt" }); delete me.card.refined; delete me.card.adjective;
  matchSay(m, `Salting: the ${me.saved.name || me.saved.rank + " of " + me.saved.suit} is salted into Rock Salt for the trick.`);
  return true;
}
// ---- Fisherfolk (fisherfolk.md; two-track D-650, D-652, D-656, D-619) and its alternatives (Reeds D-576, Egret D-578)
const isFish = (c, rank) => (!c.roster || c.roster === "main") && c.suit === "Fisherfolk" && c.rank === rank;
const isFishAlt = (c, rank, line) => c.roster === "alternative" && c.suit === "Fisherfolk" && c.rank === rank && lineBase(c) === line;
export const FISH = {
  scrappy: (c) => isFish(c, "Alsó") && c.adjective === "Scrappy", thatcher: (c) => isFish(c, "Alsó") && (c.refined || 0) >= 1,
  sturgeonFisher: (c) => isFish(c, "Felső") && (c.refined || 0) >= 1, patient: (c) => isFish(c, "Felső") && c.adjective === "Patient",
  vajda: (c) => isFish(c, "Király") && (c.refined || 0) >= 1, canny: (c) => isFish(c, "Király") && c.adjective === "Canny",
  harpooner: (c) => isFish(c, "VII") && (c.refined || 0) >= 1, calloused: (c) => isFish(c, "VII") && c.adjective === "Calloused",
  slippery: (c) => isFish(c, "VIII") && c.adjective === "Slippery", basket: (c) => isFish(c, "VIII") && (c.refined || 0) >= 1,
  fanciful: (c) => isFish(c, "IX") && c.adjective === "Fanciful", papers: (c) => isFish(c, "IX") && (c.refined || 0) >= 1,
  sturgeon: (c) => isFish(c, "X") && (c.refined || 0) >= 1, voracious: (c) => isFish(c, "X") && c.adjective === "Voracious",
  bogman: (c) => isFish(c, "Ász") && (c.refined || 0) >= 1, weatherwise: (c) => isFish(c, "Ász") && c.adjective === "Weatherwise",
  reeds: (c) => isFishAlt(c, "VIII", "Reeds"), egret: (c) => isFishAlt(c, "X", "Egret"),
};
const DRY = new Set(["VIII", "IX", "Alsó", "Felső", "Király"]);             // dry cards: every rank but VII, X and Ász (fisherfolk.md)
function fishOnPlay(m, seat, c, me, rng, run) {
  const st = m.trick.stack, t = m.trick, side = seat % 2, r = c.refined || 0, i = st.indexOf(me);
  // Reed Harvest (Scrappy Reed Cutter line): 1 coin per dry card already in the trick
  if (FISH.scrappy(c) && once(m, "reedharvest", c)) { const n = st.slice(0, i).filter((x) => DRY.has(x.card.rank)).length; if (n && side === 0) { m.coins += n; matchSay(m, `Reed Harvest: ${n} coin${n === 1 ? "" : "s"} from the reed beds.`); } }
  // Big Catch (Sturgeon Fisherman): 10 coins per X or Ász already in the trick
  if (FISH.sturgeonFisher(c) && once(m, "bigcatch", c)) { const n = st.slice(0, i).filter((x) => x.card.rank === "X" || x.card.rank === "Ász").length; if (n && side === 0) { m.coins += 10 * n; matchSay(m, `Big Catch: ${10 * n} coins.`); } }
  // Piercing Claim (Harpooner): its claim ignores abilities that would prevent it (D-626); stopped only if its own ability is
  if (FISH.harpooner(c)) me.pierce = true;
  // Slippery (Slippery Loach line): the first card on it, after its ability, 30 % slips between the Loach and the card to match
  if (FISH.slippery(c) && once(m, "slippery", c)) me.slippy = true;
  // I Once Caught a Bigger One! (Fanciful IX, either stage, D-656): 50 % one random Fisherfolk VIII in the trick becomes a basic
  // Fisherfolk X; for good on encounter cards and cargo, for the trick on personal cards
  if (FISH.fanciful(c) && once(m, "biggerone", c)) {
    const el = st.filter((x) => x !== me && x.card.suit === "Fisherfolk" && x.card.rank === "VIII" && !frozen(st, x) && !ALT.tools(x.card));
    if (el.length && rng.next() < 0.5) {
      const x = choose(m, rng, el, () => null), v = rng.pick(COMMODITY_STAGES.filter((y) => y.suit === "Fisherfolk" && y.rank === "X" && y.stage === 0));
      const to = { rank: "X", roster: v.roster, name: v.name };
      if (x.card.origin === "pers") remember(x);
      else if (x.card.ref) { Object.assign(x.card.ref, to); delete x.card.ref.refined; delete x.card.ref.adjective; }
      Object.assign(x.card, to); delete x.card.refined; delete x.card.adjective;
      matchSay(m, `I Once Caught a Bigger One!: the loach grows into a ${v.name}.`);
    }
  }
  // Bottom Feeding (Sturgeon 2, Beluga Sturgeon 3): cards nearest the card to match leave for the round; never the target (D-650)
  if (FISH.sturgeon(c) && once(m, "bottomfeed", c)) {
    const n = r >= 2 ? 3 : 2, el = st.slice(1, i).filter((x) => !frozen(st, x) && !bound(st, x) && !ALT.tools(x.card)).slice(0, n);
    if (el.length) { for (const x of el) { (t.fed ??= []).push({ entry: x, depth: st.indexOf(x) }); } for (const x of el) st.splice(st.indexOf(x), 1);
      matchSay(m, `Bottom Feeding: ${el.length} card${el.length === 1 ? "" : "s"} vanish into the mud for the round.`); }
  }
  // Borrowed Tricks (Bogman: an ability a card in the trick has; Pákász: one it could have): a copy fires as this card's own, its
  // claims this card's player's (D-366, D-652)
  if (FISH.bogman(c) && once(m, "borrow", c)) {
    const up = (x) => (x.card.refined || 0) > 0 || !!x.card.adjective;
    const el = st.filter((x) => x !== me && !(isFish(x.card, "Ász") && x === me) && x.card !== c && (r >= 2 ? !!upgradeEntry(x.card) : up(x)));
    if (el.length) {
      const x = choose(m, rng, el, () => null), e = upgradeEntry(x.card);
      const { id, ref, ...rest } = x.card, clone = card(x.card.rank, x.card.suit, { ...rest, origin: me.card.origin });
      if (r >= 2 && e) { clone.refined = e.stages.length - 1; clone.adjective = e.adjective; }
      matchSay(m, `Borrowed Tricks: the ${c.name || "Fowler"} borrows the ${x.card.name || x.card.rank + " of " + x.card.suit}'s trick.`);
      m.chainRun = true; try { run(m, seat, clone, me); } finally { m.chainRun = false; }
    } else matchSay(m, "Borrowed Tricks: nothing to borrow.");
  }
  // Ennoblement (Egret Plumage; Ornamental Plumage: plus the raised rank's base value in coins): the bottom card's rank +1 until the
  // trick is decided; Coverup redirects it (D-578, D-579)
  if (FISH.egret(c) && r >= 1 && once(m, "ennoble", c)) {
    const b = bottomTarget(st), k = RANK_ORDER.indexOf(b.card.rank);
    if (b && k >= 0 && k < RANK_ORDER.length - 1 && !frozen(st, b) && !ALT.tools(b.card)) {
      remember(b); b.card.rank = RANK_ORDER[k + 1];
      if (r >= 2 && side === 0) { const v = { VII: 6, VIII: 3, IX: 5, X: 10, "Alsó": 1, "Felső": 2, "Király": 4, "Ász": 11 }[b.card.rank]; m.coins += v; }
      matchSay(m, `Ennoblement: the ${b === st[0] ? "card to match" : "Woven card"} rises to a ${b.card.rank}.`);
    }
  }
}
// the agricultural Beasts roster (beasts-agricultural.md; D-484 to D-523, D-655, D-656)
const isFarmBeast = (c, rank) => c.roster === "agricultural roster" && c.suit === "Beasts" && c.rank === rank;
export const AGRI = {
  locust: (c) => isFarmBeast(c, "VII"),                                              // never counts toward the cargo minimum (intrinsic, D-655)
  plague: (c) => isFarmBeast(c, "VII") && (c.refined || 0) >= 1, devouring: (c) => isFarmBeast(c, "VII") && c.adjective === "Devouring",
  down: (c) => isFarmBeast(c, "VIII") && (c.refined || 0) >= 1, sleepy: (c) => isFarmBeast(c, "VIII") && c.adjective === "Sleepy",
  leaf: (c) => isFarmBeast(c, "IX") && (c.refined || 0) >= 1, innocuous: (c) => isFarmBeast(c, "IX") && c.adjective === "Innocuous",
  dried: (c) => isFarmBeast(c, "X") && (c.refined || 0) >= 1, soothing: (c) => isFarmBeast(c, "X") && c.adjective === "Soothing",
  csalaver: (c) => isFarmBeast(c, "Alsó") && (c.refined || 0) >= 1, pilfering: (c) => isFarmBeast(c, "Alsó") && c.adjective === "Pilfering",
  toportyan: (c) => isFarmBeast(c, "Felső") && (c.refined || 0) >= 1, scavenging: (c) => isFarmBeast(c, "Felső") && c.adjective === "Scavenging",
  ebborz: (c) => isFarmBeast(c, "Király") && (c.refined || 0) >= 1, tenacious: (c) => isFarmBeast(c, "Király") && c.adjective === "Tenacious",
  greatBustard: (c) => isFarmBeast(c, "Ász") && (c.refined || 0) >= 1, booming: (c) => isFarmBeast(c, "Ász") && c.adjective === "Booming",
};
function agriOnPlay(m, seat, c, me, rng) {
  const st = m.trick.stack, t = m.trick, side = seat % 2, r = c.refined || 0;
  // Devour (Plague): the two cards directly beneath leave the trick and go straight to the Locust's player; personal cards stay
  // transient; the bottom card is eligible (D-500, D-501, D-655)
  if (AGRI.plague(c) && once(m, "devour", c)) {
    const i = st.indexOf(me), eaten = [st[i - 1], st[i - 2]].filter((x) => x && !frozen(st, x) && !bound(st, x) && !ALT.tools(x.card) && !(x === st[0] && insulated(x)));
    if (eaten.length) {
      for (const x of eaten) st.splice(st.indexOf(x), 1);
      m.captured[side].push(...eaten.filter((x) => x.card.origin === "enc").map((x) => x.card));
      for (const x of eaten) if (x.card.origin === "pers") (m.returned ??= []).push(x.card);
      m.history.push({ stack: eaten, winner: seat, team: side, devoured: true });
      matchSay(m, `Devour! The Plague strips ${eaten.length} card${eaten.length === 1 ? "" : "s"} from the trick for ${m.names[seat]}.`);
    }
  }
  // Sleepy (any stage): the card played directly above can't trigger its trick ability; its claim is untouched (D-502, D-656)
  if (AGRI.sleepy(c) && once(m, "sleepy", c)) me.sleepy = true;
  // Disconcerting (Innocuous IX): non-allied Farmfolk (Chewed Leaf: also Plainsfolk, Forestfolk) can't claim this trick; at
  // Chewed Leaf each suppressed claim pays its player one VIII of that suit; with no claim left the caller takes the trick (D-511, D-656)
  if (AGRI.innocuous(c) && once(m, "disconcert", c)) {
    t.disconcert = { team: side, suits: r >= 1 ? ["Farmfolk", "Plainsfolk", "Forestfolk"] : ["Farmfolk"], comp: r >= 1 };
    me.callerSeat = t.caller;
    for (const x of st.slice()) disconcert(m, x, rng);
    matchSay(m, "Disconcerting: a chewed leaf in the trick, and the farmers lose their nerve.");
  }
  // Infusion (Dried Chamomile: a random Beasts card played earlier in the encounter; Herbal Tea: the most recent one): an exact copy
  // placed directly above, not played; transient, never awarded; its claim counts for the Chamomile's player (D-513 to D-516)
  if (AGRI.dried(c) && once(m, "infusion", c)) {
    const played = (x) => x !== me && !x.placed && !x.inserted && !x.copy && !x.tower && x.card.suit === "Beasts";
    const pool = [...m.history.flatMap((h) => h.stack), ...st].filter(played);
    const pos = st.indexOf(me) + 1;
    if (!pool.length) matchSay(m, "Infusion: no Beasts card to steep (it fails).");
    else if (canInsert(st, pos)) {
      const src = r >= 2 ? pool[pool.length - 1] : choose(m, rng, pool, (x) => { const o = st.slice(); o.splice(pos, 0, { seat, card: x.card }); return o; });
      const { id, ref, ...rest } = src.card;
      st.splice(pos, 0, { seat, card: card(src.card.rank, src.card.suit, { ...rest, origin: "pers", echo: true }), placed: true, copy: true });
      matchSay(m, `Infusion: a copy of the ${src.card.name || src.card.rank + " of Beasts"} steeps into the trick.`);
    }
  }
  // Pilfering (Pilfering Fox): one random card of the trick, itself or the bottom card included, is taken out; it comes back at the
  // trick's end, 50 % at its old depth, 50 % on top, decided now; the Csalavér tells its player where (D-490, D-491)
  if (AGRI.pilfering(c) && once(m, "pilfer", c)) {
    const el = st.filter((x) => !frozen(st, x) && !bound(st, x) && !ALT.tools(x.card));
    if (el.length) {
      const x = choose(m, rng, el, (y) => st.filter((z) => z !== y));
      if (!(x === st[0] && insulated(x))) {
        const depth = st.indexOf(x), top = rng.next() < 0.5;
        st.splice(depth, 1); (t.pilfered ??= []).push({ entry: x, depth, top });
        matchSay(m, `Pilfering: the fox makes off with the ${x.card.name || x.card.rank + " of " + x.card.suit}.`);
        if (r >= 1 && side === 0) matchSay(m, `(Only you hear the Csalavér: it will come back ${top ? "on top of the trick" : "where it was"}.)`);
      }
    }
  }
  // Tenacious (Tenacious Badger): blocks ability claims made directly above it; the Ebborz also above later Beasts cards (D-498, D-499)
  if (AGRI.tenacious(c) && once(m, "tenacious", c)) me.tenacious = { ebborz: r >= 1 };
  // Lekking (Great Bustard: claims as the rank of the card to match; Túzok: the next player must play an Ász if able) (D-517 to D-522)
  if (AGRI.greatBustard(c) && st[0] !== me && once(m, "lek", c)) {
    me.claimRank = st[0].card.rank; matchSay(m, `Lekking: the bustard struts as a ${me.claimRank}.`);
    if (r >= 2) m.lek = { seat: (seat + 1) % 4, card: c };
  }
}
// Disconcerting's mark on a non-allied card of an affected suit; compensation once per suppressed claim (Chewed Leaf)
function disconcert(m, x, rng) {
  const d = m.trick.disconcert;
  if (!d || x.discon || team2(x.seat) === d.team || !d.suits.includes(x.card.suit)) return;
  const st = m.trick.stack, would = claimOf(st).index === st.indexOf(x);
  x.discon = true;
  if (would && d.comp && x.seat % 2 === 0) {
    const v = rng.pick(COMMODITY_STAGES.filter((y) => y.suit === x.card.suit && y.rank === "VIII" && y.stage === 0 && y.roster !== "secret alternative"));
    m.generated.push({ rank: "VIII", suit: v.suit, roster: v.roster, name: v.name }); matchSay(m, `Disconcerting: your ${x.card.suit} card gives up its claim, for ${v.name}.`);
  }
}
// ---- the mercenaries' signature trick abilities (final stage only, D-360; once per encounter, D-313)
const isMerc = (c, id) => c && c.merc === id && c.stage >= 3;
// Impersonation (Illustrious Impresario): while in a trick it secretly IS a random Ász: one from the encounter deck's make-up in
// regular and POI matches, one from cargo at checkpoints, a basic Ász in ambushes and duels; it takes that card's suit, rank, claim
// and unlocked abilities; before the award it's revealed, restored and the claim recalculated (D-364, D-365)
function impersonate(m, me, rng) {
  const t = m.trick;
  let pool = [];
  if (m.kind === "checkpoint") pool = [...m.deck, ...m.hands.flat(), ...m.history.flatMap((h) => h.stack.map((x) => x.card))].filter((x) => x.origin === "enc" && x.rank === "Ász");
  else if (m.kind === "location") pool = (m.suits || []).map((su) => ({ rank: "Ász", suit: su }));
  const src = pool.length ? rng.pick(pool) : { rank: "Ász", suit: rng.pick(SUITS12) };
  const { id, ref, origin, ownerSeat, own, ...look } = src;
  remember(me); Object.assign(me.card, { ...look, rank: "Ász" }); delete me.card.merc;
  (t.endHooks ??= []).push(() => { restoreIdentities([me]); me.card.merc = 2; matchSay(m, `Impersonation revealed: it was the Impresario all along, not the Ász of ${src.suit}.`); });
  matchSay(m, `The Ász of ${src.suit} is played.`);       // to everyone, it simply is that Ász
}
// Fresh Recruits! (Grizzled Warhound): every dry card from the shared encounter deck in the four hands goes back into that deck,
// shuffled, then each player draws back to their hand size (D-346; dry = VIII, IX, Alsó, Felső, Király)
function freshRecruits(m, rng) {
  const sizes = m.hands.map((h) => h.length), back = [];
  for (const h of m.hands) for (let k = h.length - 1; k >= 0; k--) if (h[k].origin === "enc" && DRY.has(h[k].rank)) back.push(...h.splice(k, 1));
  m.deck.push(...back); for (let i = m.deck.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [m.deck[i], m.deck[j]] = [m.deck[j], m.deck[i]]; }
  m.hands.forEach((h, s2) => { while (h.length < sizes[s2] && m.deck.length) h.push(m.deck.pop()); });
  matchSay(m, `Fresh Recruits! The Warhound throws out ${back.length} unsuitable recruit${back.length === 1 ? "" : "s"} and demands replacements.`);
}
// automatic ambush (Vengeful Lidérc, in its owner's hand): an X or Ász played into the trick that costs the owner's side its claim
// brings it in at once, 50 % on top, 50 % second from the bottom, to claim as a Seven (D-338)
function vengeful(m, seat, me, heldBy, rng) {
  const st = m.trick.stack, after = claimOf(st);
  if (!heldBy || !after || !["X", "Ász"].includes(me.card.rank) || team2(after.seat) === team2(heldBy.seat) || team2(seat) === team2(heldBy.seat)) return;
  for (const s2 of [0, 1, 2, 3].filter((k) => team2(k) === team2(heldBy.seat))) {
    const k = m.hands[s2].findIndex((x) => isMerc(x, 1)); if (k < 0 || !once(m, "vengeful", m.hands[s2][k])) continue;
    const top = rng.next() < 0.5, pos = top ? st.length : 1; if (!canInsert(st, pos)) continue;
    const c = m.hands[s2].splice(k, 1)[0]; st.splice(pos, 0, { seat: s2, card: c, placed: true });
    matchSay(m, `The Vengeful Lidérc springs out of ${m.names[s2]}'s pocket ${top ? "onto the top of the trick" : "just above the bottom card"}!`); return;
  }
}
// protective substitution (Avaricious Profiteer, one of your two personal cards in hand, the other a dry card): an opponent's claim
// over a trick with your Ász swaps that other card into the Ász's place and the Ász back to your hand; the Profiteer card is then
// shuffled back into your personal deck (D-359, D-363)
function profiteer(m, seat, rng) {
  // the trigger: the opponent who just played establishes (or renews) their side's claim (D-363)
  const st = m.trick.stack, after = claimOf(st); if (!after || after.team !== team2(seat) || st[after.index] !== st[st.length - 1]) return;
  for (const s2 of [0, 1, 2, 3].filter((k) => team2(k) !== after.team)) {
    const h = m.hands[s2], pers = h.filter((x) => x.origin === "pers"), prof = pers.find((x) => isMerc(x, 4)), other = pers.find((x) => !isMerc(x, 4));
    if (!prof || !other || pers.length !== 2 || ["VII", "X", "Ász"].includes(other.rank)) continue;
    const ace = st.find((x) => x.seat === s2 && x.card.rank === "Ász" && !frozen(st, x) && !bound(st, x)); if (!ace || !once(m, "profiteer", prof)) continue;
    const a = ace.card; h.splice(h.indexOf(other), 1); ace.card = other; h.push(a);
    h.splice(h.indexOf(prof), 1); const pile = m.personal[s2 === 2 && !m.personal[2] ? 0 : s2] || m.personal[0]; pile.splice(Math.floor(rng.next() * (pile.length + 1)), 0, prof);
    matchSay(m, `The Avaricious Profiteer swaps the Ász out for ${other.name || other.rank + " of " + other.suit}, for a consideration.`); return;
  }
}
// a temporary change of refinement stage (Grinding -1, Rising +1); the name follows the stage; undone at the trick's end (D-610, D-618)
function restage(x, d) {
  const e = upgradeEntry(x.card), r = (x.card.refined || 0) + d, max = e ? e.stages.length - 1 : 2;
  if (r < 0 || r > max) return false;
  remember(x); x.card.refined = r; if (!r) delete x.card.refined;
  const nm = e ? e.stages[r] : COMMODITY_STAGES.find((y) => y.suit === x.card.suit && y.rank === x.card.rank && y.roster === (x.card.roster || "main") && y.stage === r)?.name;
  if (nm) x.card.name = (x.card.adjective ? x.card.adjective + " " : "") + nm;
  return true;
}
const liveE = (x) => x && !x.based && !x.horizontal && !x.silenced && !x.suppressed;
// Grinding (Miller) and Rising (Bread) act on the card played directly on top, BEFORE its abilities resolve (D-609 to D-611, D-618)
function beforeAbilities(m, me, rng) {
  const st = m.trick.stack, prev = st[st.indexOf(me) - 1];
  if (!liveE(prev)) return;
  if (RURAL_T.miller(prev.card)) {
    const i = st.indexOf(prev);
    if (!(me.card.refined >= 1) || frozen(st, me) || !canInsert(st, i)) { matchSay(m, "Grinding: nothing to grind here."); return; }
    restage(me, -1);
    st.splice(i, 0, { seat: prev.seat, card: card("VIII", "Farmfolk", { origin: "enc", generated: true, name: "Wheat" }), inserted: true });
    matchSay(m, `Grinding: the ${me.card.name || me.card.rank} is ground down a stage, and Wheat spills beneath the Miller.`);
  } else if (RURAL_T.bread(prev.card) && ["Alsó", "Felső", "Király"].includes(me.card.rank) && !frozen(st, me)) {
    if (rng.next() < 0.5 && restage(me, +1)) matchSay(m, `Rising: the ${me.card.name || me.card.rank} rises a stage for the trick.`);
  }
}
const ORDINARY = new Set(["matching rank", "Seven", "Herd Guard"]);      // capture by the ordinary rule (D-615)
// after each play: the claim log Arbitration reads, and the Councillor's and Mesmerise's protections (D-615, D-616, D-627)
function afterPlay(m, seat, me, heldBy) {
  const t = m.trick, st = t.stack, after = claimOf(st);
  if (!heldBy || !after || !st.includes(heldBy) || st[after.index] === heldBy) return;
  if (me.pierce && st[after.index] === me && heldBy.prot) delete heldBy.prot;   // Written Protection ends when pierced (D-571)
  if (me.pierce && st[after.index] === me) return void (t.claimLog ??= []).push({ from: heldBy, team: team2(heldBy.seat), lost: after.team !== team2(heldBy.seat), ordinary: true });   // Piercing Claim (D-626)
  const ordinary = st[after.index] === me && ORDINARY.has(after.reason), side = team2(heldBy.seat), lost = after.team !== side;
  const keep = (why) => { heldBy.keep = new Set(st); matchSay(m, why); };
  if (t.councillor && t.councillor.card !== me.card) {
    const cc = t.councillor; t.councillor = null;
    if (lost && side === cc.team && !ordinary) return keep("Arbitration: the Councillor rules the claim stays where it was.");
  }
  if (t.mesmer && lost && side === t.mesmer.team && team2(seat) !== side) { t.mesmer = null; return keep("Mesmerise: the attempt on the claim falters."); }
  if (t.cover && lost && side === t.cover.team && heldBy.card.suit === "Hillfolk" && after.reason !== "matching rank") { t.cover = null; return keep("Covering Fire: the crossbows hold the claim."); }
  (t.claimLog ??= []).push({ from: heldBy, team: side, lost, ordinary });
}
function townsRuralOnPlay(m, seat, c, me, rng) {
  const st = m.trick.stack, t = m.trick, side = seat % 2, below = st[st.indexOf(me) - 1];
  // Raise the Alarm (Bellman): 50 % a basic Volunteer into the owner's hand; it vanishes at the trick's end if unplayed (D-614)
  if (RURAL_T.bellman(c) && once(m, "alarm", c) && rng.next() < 0.5) {
    m.hands[seat].push(card("VII", "Townsfolk", { roster: "rural roster", name: "Volunteer", origin: "enc", generated: true, vanish: true }));
    matchSay(m, `Raise the Alarm: a Volunteer comes running to ${m.names[seat]}.`);
  }
  // Sticky Dough (Bread Dough, Bread; D-618, D-654): played directly on the capture target, it swaps in as the new one (Bull Toss swap)
  if (RURAL_T.dough(c) && st.indexOf(me) === 1 && !frozen(st, st[0]) && !frozen(st, me) && once(m, "dough", c)) {
    if (!insulated(st[0])) { [st[0], st[1]] = [st[1], st[0]]; matchSay(m, "Sticky Dough: the dough smothers the card to match and takes its place."); }
  }
  // Market Run (Unremarkable IX): on a rank VIII, a basic copy of its effective identity for your cargo (D-622, D-736)
  if (RURAL_T.unremarkable(c) && below && below.card.rank === "VIII" && once(m, "marketrun", c)) {
    const b = below.card, base = upgradeEntry(b)?.stages[0] || COMMODITY_STAGES.find((x) => x.suit === b.suit && x.rank === "VIII" && x.roster === (b.roster || "main") && x.stage === 0)?.name;
    if (side === 0) { m.generated.push({ rank: "VIII", suit: b.suit, roster: b.roster || "main", ...(base ? { name: base } : {}) }); matchSay(m, `Market Run: a basic ${base || b.suit + " VIII"} for your cargo after the match.`); }
  }
  // Remedy (Herbalist): undoes the temporary change on one random allied card in the trick (D-608)
  if (RURAL_T.herbalist(c)) {
    const el = st.filter((x) => x !== me && team2(x.seat) === side && (x.saved || x.revertSuit) && !frozen(st, x));
    if (el.length && once(m, "remedy", c)) {
      const x = choose(m, rng, el, () => null);
      if (x.saved) restoreIdentities([x]); if (x.revertSuit) { x.card.suit = x.revertSuit; delete x.revertSuit; }
      matchSay(m, `Remedy: the ${x.card.name || x.card.rank + " of " + x.card.suit} is itself again.`);
    }
  }
  // Arbitration (Judicious Király): the Councillor guards the first claim change after it; the Judge restores the most recent
  // claim his side lost to an ability, unless an ordinary capture has happened since (D-615, D-616)
  if (RURAL_T.judicious(c) && once(m, "arbitration", c)) {
    if (!(c.refined >= 1)) t.councillor = { team: side, card: c };
    else {
      const log = t.claimLog || [], k = log.map((e, i) => (e.lost && e.team === side && !e.ordinary ? i : -1)).filter((i) => i >= 0).pop();
      const cl = claimOf(st), e = k === undefined ? null : log[k];
      if (e && st.includes(e.from) && cl.team !== side && !log.slice(k + 1).some((x) => x.ordinary)) {
        e.from.keep = new Set(st); matchSay(m, "Arbitration: the Village Judge restores the claim.");
      }
    }
  }
  // Defiance (Proud, Star-Eyed): every Király in the trick loses its abilities' power; no new ones for the trick (D-627)
  if (RURAL_T.proud(c) && once(m, "defiance", c)) {
    t.defiance = true;
    for (const x of st) if (x.card.rank === "Király") silence(m, x);
    matchSay(m, "Defiance! The Shepherd won't bow: the kings' powers fall silent.");
  }
  // Mesmerise (Star-Eyed): if its side holds the claim, the next opposing attempt on it fails (D-627)
  if (RURAL_T.starEyed(c) && claimOf(st).team === side && once(m, "mesmer", c)) t.mesmer = { team: side, card: c };
}
function silence(m, x) {
  x.silenced = true; x.insulated = false; delete x.prot; delete x.roots; delete x.racket; delete x.keep; x.lawNext = x.noFunny = x.saddle = x.tallTales = x.sleepy = false; delete x.tenacious;
  if (m.lek && m.lek.card === x.card) m.lek = null;
  for (const k of ["ferment", "revulsion", "indulge", "toArms", "chain", "anotherRound", "councillor", "mesmer"]) if (m.trick[k] && (m.trick[k].card === x.card || m.trick[k].by === x.seat && k === "ferment")) m.trick[k] = null;
  for (const k of ["hearYe", "rightOfWay", "intimidate"]) if (m[k] && m[k].card === x.card) m[k] = null;
}
// alternative commodity lines (commodity-alternatives.md), recognised by suit, rank and line
const isAlt = (c, suit, rank, line) => c.roster === "alternative" && c.suit === suit && c.rank === rank && lineBase(c) === line;
export const ALT = {
  millet: (c) => isAlt(c, "Farmfolk", "VIII", "Millet"), grapes: (c) => isAlt(c, "Farmfolk", "VIII", "Grapes"),
  sweet: (c) => isAlt(c, "Farmfolk", "X", "Sweet Grapes"), parchment: (c) => isAlt(c, "Clergy", "VIII", "Parchment"),
  reliquary: (c) => isAlt(c, "Clergy", "X", "Reliquary"),
  pig: (c) => isAlt(c, "Plainsfolk", "VIII", "Plains Pig"), horse: (c) => isAlt(c, "Plainsfolk", "X", "Wild Horse"),
  dice: (c) => isAlt(c, "Carnivalfolk", "VIII", "Bone Dice"), koboz: (c) => isAlt(c, "Carnivalfolk", "X", "Koboz"),
  weapons: (c) => isAlt(c, "King's Men", "VIII", "Broken Weapons"), saltpetre: (c) => isAlt(c, "King's Men", "X", "Saltpetre"),
  coins: (c) => isAlt(c, "Bandits", "VIII", "Clipped Coins"), dagger: (c) => isAlt(c, "Bandits", "X", "Concealed Dagger"),
  tools: (c) => isAlt(c, "Bandits", "X", "Concealed Dagger") && (c.refined || 0) >= 2,   // Assassination Tools: can't be targeted (D-641)
  lard: (c) => c.suit === "Plainsfolk" && c.rank === "X" && c.roster === "secret alternative",       // Almighty Lard (D-596, D-598)
  lucky: (c) => (!c.roster || c.roster === "main") && c.suit === "Hillfolk" && c.rank === "X" && c.adjective === "Lucky",   // Good Fortune (D-378, D-656)
};
const isKing = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "King's Men" && card.rank === rank;
export const KINGS = {
  veteran: (c) => isKing(c, "VII") && (c.refined || 0) >= 1,                // Reinforcements
  seasoned: (c) => isKing(c, "VII") && c.adjective === "Seasoned",          // Basic Training (cargo)
  keepsakes: (c) => isKing(c, "VIII") && (c.refined || 0) >= 1,             // Refinement Jackpot (Keepsakes: itself; Heirloom: any)
  heirloom: (c) => isKing(c, "VIII") && (c.refined || 0) >= 2,
  hardWon: (c) => isKing(c, "VIII") && c.adjective === "Hard-Won",          // Victory Refinement
  orders: (c) => isKing(c, "IX") && (c.refined || 0) >= 1,                  // Marching Formation, Official Business (personal deck)
  royal: (c) => isKing(c, "IX") && c.adjective === "Royal",                 // By Royal Decree!
  charger: (c) => isKing(c, "X") && (c.refined || 0) >= 1,                  // Run Them Down! 10 % / Nightmare 25 % (personal deck)
  defiant: (c) => isKing(c, "X") && c.adjective === "Defiant",              // Back in the Saddle!
  musterOfficer: (c) => isKing(c, "Alsó") && (c.refined || 0) >= 1,         // Muster!
  strict: (c) => isKing(c, "Alsó") && c.adjective === "Strict",             // Military Escort (personal deck)
  knight: (c) => isKing(c, "Felső") && (c.refined || 0) >= 1,               // Knight's Authority (claim rule in zsir.js)
  aspiring: (c) => isKing(c, "Felső") && c.adjective === "Aspiring",        // Ransom (cargo)
  general: (c) => isKing(c, "Király") && (c.refined || 0) >= 1,             // Spoils of War!
  victorious: (c) => isKing(c, "Király") && c.adjective === "Victorious",   // War Chest (personal deck)
  strategist: (c) => isKing(c, "Ász") && (c.refined || 0) >= 1,             // Battle Formation!
  cunning: (c) => isKing(c, "Ász") && c.adjective === "Cunning",            // Contingency Plan (personal deck)
};
export const conscript = (c) => (!c.roster || c.roster === "main") && c.suit === "Farmfolk" && c.rank === "Alsó" && (c.refined || 0) >= 1;
const isBeast = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Beasts" && card.rank === rank;
export const BEASTS = {
  tusker: (c) => isBeast(c, "VII") && (c.refined || 0) >= 1,                // Rampage
  rooting: (c) => isBeast(c, "VII") && c.adjective === "Rooting",           // Rooting (cargo)
  sorted: (c) => isBeast(c, "VIII") && (c.refined || 0) >= 1,               // Proliferation 25 % / Edible 50 %
  bountiful: (c) => isBeast(c, "VIII") && c.adjective === "Bountiful",      // Spore Spread (cargo)
  treebark: (c) => isBeast(c, "IX") && (c.refined || 0) >= 1,               // Game Trails (no parallel roads), Wild Stench
  odd: (c) => isBeast(c, "IX") && c.adjective === "Odd-Smelling",           // Smelly Treebark
  mead: (c) => isBeast(c, "X") && (c.refined || 0) >= 1,                    // Sticky Residue
  fortified: (c) => isBeast(c, "X") && c.adjective === "Fortified",         // Preservation (cargo)
  alpha: (c) => isBeast(c, "Alsó") && (c.refined || 0) >= 1,                // Pack Instinct (claim rule in zsir.js)
  pack: (c) => isBeast(c, "Alsó") && c.adjective === "Pack",                // Pack Hunting (cargo)
  phantom: (c) => isBeast(c, "Felső") && (c.refined || 0) >= 1,             // Stalking
  solitary: (c) => isBeast(c, "Felső") && c.adjective === "Solitary",       // Solitary Hunter (cargo)
  monarch: (c) => isBeast(c, "Király") && (c.refined || 0) >= 1,            // Bear's Might
  mighty: (c) => isBeast(c, "Király") && c.adjective === "Mighty",          // King of the Forest (cargo)
  stag: (c) => isBeast(c, "Ász") && (c.refined || 0) >= 1,                  // Divine Guidance
  unerring: (c) => isBeast(c, "Ász") && c.adjective === "Unerring",         // True Path (personal deck)
};
const isBand = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Bandits" && card.rank === rank;
export const BANDITS = {
  reaver: (c) => isBand(c, "VII") && (c.refined || 0) >= 1,                 // Pillage
  shifty: (c) => isBand(c, "VII") && c.adjective === "Shifty",              // Concealed Muscle (cargo)
  loot: (c) => isBand(c, "VIII") && (c.refined || 0) >= 1,                  // Contamination
  dubious: (c) => isBand(c, "VIII") && c.adjective === "Dubious",           // Hidden Extras (on refinement)
  plunder: (c) => isBand(c, "VIII"),                                        // the Plunder line (main roster)
  papers: (c) => isBand(c, "IX") && (c.refined || 0) >= 1,                  // False Identity (no other caravans), False Manifest
  convincing: (c) => isBand(c, "IX") && c.adjective === "Convincing",       // Identity Theft
  essence: (c) => isBand(c, "X") && (c.refined || 0) >= 1,                  // Hallucination
  intoxicating: (c) => isBand(c, "X") && c.adjective === "Intoxicating",    // Black Market (cargo)
  highwayman: (c) => isBand(c, "Alsó") && (c.refined || 0) >= 1,           // Highway Robbery (personal deck)
  devious: (c) => isBand(c, "Alsó") && c.adjective === "Devious",           // Sleight of Hand
  masterFence: (c) => isBand(c, "Felső") && (c.refined || 0) >= 1,          // Criminal Commission
  shrewd: (c) => isBand(c, "Felső") && c.adjective === "Shrewd",            // Roadside Refinement (personal deck)
  crimeLord: (c) => isBand(c, "Király") && (c.refined || 0) >= 1,           // Protection Racket
  crooked: (c) => isBand(c, "Király") && c.adjective === "Crooked",         // Extortion (personal deck)
  robber: (c) => isBand(c, "Ász") && (c.refined || 0) >= 1,                 // Theft (Zsivány: 25 % payout)
  brazen: (c) => isBand(c, "Ász") && c.adjective === "Brazen",              // Checkpoint Bribery (either deck)
};
const isCarn = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Carnivalfolk" && card.rank === rank;
export const CARNIVAL = {
  puppeteer: (c) => isCarn(c, "Alsó") && (c.refined || 0) >= 1,             // Upstage
  charming: (c) => isCarn(c, "Alsó") && c.adjective === "Charming",         // Street Performance (personal deck)
  juggler: (c) => isCarn(c, "Felső") && (c.refined || 0) >= 1,              // Juggling Act
  deft: (c) => isCarn(c, "Felső") && c.adjective === "Deft",                // Payment in Kind (either deck)
  herald: (c) => isCarn(c, "Király") && (c.refined || 0) >= 1,              // Hear Ye!
  resounding: (c) => isCarn(c, "Király") && c.adjective === "Resounding",   // Roll Up! (personal deck)
  swallower: (c) => isCarn(c, "VII") && (c.refined || 0) >= 1,              // Crowd Pleaser
  unflinching: (c) => isCarn(c, "VII") && c.adjective === "Unflinching",    // Concealed Threat (either deck)
  doll: (c) => isCarn(c, "VIII") && (c.refined || 0) >= 1,                  // Make-Believe (claim rule in zsir.js)
  lively: (c) => isCarn(c, "VIII") && c.adjective === "Lively",             // Crowd Favourite (cargo)
  papers: (c) => isCarn(c, "IX") && (c.refined || 0) >= 1,                  // Fairground Rights, Safe Passage (personal deck)
  dazzling: (c) => isCarn(c, "IX") && c.adjective === "Dazzling",           // Right of Way
  bear: (c) => isCarn(c, "X") && (c.refined || 0) >= 1,                     // Intimidation
  lumbering: (c) => isCarn(c, "X") && c.adjective === "Lumbering",          // Bear Guard (either deck)
  jester: (c) => isCarn(c, "Ász") && (c.refined || 0) >= 1,                 // Fool's Gold
  madcap: (c) => isCarn(c, "Ász") && c.adjective === "Madcap",              // Moving the Goalposts (personal deck)
};
const isTowns = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Townsfolk" && card.rank === rank;
export const TOWNS = {
  constable: (c) => isTowns(c, "VII") && (c.refined || 0) >= 1,             // No Funny Business!
  greedy: (c) => isTowns(c, "VII") && c.adjective === "Greedy",             // Kickbacks (cargo)
  candles: (c) => isTowns(c, "VIII") && (c.refined || 0) >= 1,              // Guiding Light: 1 / 2 cards
  guiding: (c) => isTowns(c, "VIII") && c.adjective === "Guiding",          // Light the Way (cargo)
  citizen: (c) => isTowns(c, "IX") && (c.refined || 0) >= 1,                // Local Craftsmen, Local Discount (personal deck)
  established: (c) => isTowns(c, "IX") && c.adjective === "Established",    // Home Advantage
  wine: (c) => isTowns(c, "X") && (c.refined || 0) >= 1,                    // Lost Socks
  heady: (c) => isTowns(c, "X") && c.adjective === "Heady",                 // Nose for Wealth (needs other caravans)
  keeper: (c) => isTowns(c, "Alsó") && (c.refined || 0) >= 1,               // Another Round!
  sharp: (c) => isTowns(c, "Alsó") && c.adjective === "Sharp",              // Tavern Gossip (needs other caravans)
  bard: (c) => isTowns(c, "Felső") && (c.refined || 0) >= 1,                // Tall Tales
  artful: (c) => isTowns(c, "Felső") && c.adjective === "Artful",           // Misinformation (personal deck)
  mayor: (c) => isTowns(c, "Király") && (c.refined || 0) >= 1,              // Market Day!
  pompous: (c) => isTowns(c, "Király") && c.adjective === "Pompous",        // Taxation (cargo)
  builder: (c) => isTowns(c, "Ász") && (c.refined || 0) >= 1,               // Erection
  ingenious: (c) => isTowns(c, "Ász") && c.adjective === "Ingenious",       // Structural Improvements (personal deck)
};
const isPlains = (card, rank) => (!card.roster || card.roster === "main") && card.suit === "Plainsfolk" && card.rank === rank;
export const PLAINS = {
  gulyas: (c) => isPlains(c, "Alsó") && (c.refined || 0) >= 1,              // Roundup
  dusty: (c) => isPlains(c, "Alsó") && c.adjective === "Dusty",             // Herd Growth (personal deck)
  csikos: (c) => isPlains(c, "Felső") && (c.refined || 0) >= 1,             // Thrown from the Saddle
  elusive: (c) => isPlains(c, "Felső") && c.adjective === "Elusive",        // Breakaway 50 % / Csikós 100 % (personal deck)
  pusztabiro: (c) => isPlains(c, "Király") && (c.refined || 0) >= 1,        // Establishing the Law (personal deck)
  stern: (c) => isPlains(c, "Király") && c.adjective === "Stern",           // Law of the Land
  pandur: (c) => isPlains(c, "VII") && (c.refined || 0) >= 1,               // Confiscation (personal deck)
  dogged: (c) => isPlains(c, "VII") && c.adjective === "Dogged",            // Hot Pursuit
  guba: (c) => isPlains(c, "VIII") && (c.refined || 0) >= 2,                // Insulation
  shaggy: (c) => isPlains(c, "VIII") && c.adjective === "Shaggy",           // Shearing (personal deck)
  papers: (c) => isPlains(c, "IX") && (c.refined || 0) >= 1,                // Hospitality, Goodwill (personal deck)
  daring: (c) => isPlains(c, "IX") && c.adjective === "Daring",             // Virtus
  burden: (c) => isPlains(c, "X") && (c.refined || 0) >= 1,                 // Beast of Burden (+4 slots; Grey Cattle -10 % services)
  stubborn: (c) => isPlains(c, "X") && c.adjective === "Stubborn",          // Stubborn as an Ox
  fugitive: (c) => isPlains(c, "Ász") && (c.refined || 0) >= 1,             // Great Escape (Betyár: whoever captures)
  notorious: (c) => isPlains(c, "Ász") && c.adjective === "Notorious",      // Saddlebag Raid (needs an opposing caravan)
};

export const FARMFOLK = {
  wary: (c) => isFarm(c, "VII") && c.adjective === "Wary",                  // Herd Protection (personal deck)
  headstrong: (c) => isFarm(c, "X") && c.adjective === "Headstrong",        // Bull Toss
  stud: (c) => isFarm(c, "X") && (c.refined || 0) >= 1,                    // Stud Service (personal deck): 1x Prize Cattle, 2x Champion
  seasonal: (c) => isFarm(c, "Alsó") && c.adjective === "Seasonal",        // Harvest Wages
  lord: (c) => isFarm(c, "Király") && (c.refined || 0) >= 1,               // Conscription
  prosperous: (c) => isFarm(c, "Király") && c.adjective === "Prosperous",  // Fealty (personal deck)
  wise: (c) => isFarm(c, "Felső") && c.adjective === "Wise",               // Field Research (personal deck)
  magnificent: (c) => isFarm(c, "Ász") && c.adjective === "Magnificent",   // Travelling Spectacle (personal deck)
  packed: (c) => isFarm(c, "VIII") && c.adjective === "Packed",            // Bulk Storage (cargo)
  produce: (c) => c.suit === "Farmfolk" && (c.rank === "VIII" || c.rank === "X"),   // Farmfolk produce: VIII and X (D-382)
};

/** Ability hook for the end of each trick. */
// a gain for seat k's owner: yours, unless seat 2 isn't your companion (a shared match's partner, D-914, or the Impresario, who keeps
// half, D-340): then it's set aside for that seat's owner
function credit(m, k, coins = 0, gen = null) {
  if ((m.shared || m.mercHalf) && k === 2) { m.sideGains ??= { generated: [], coins: 0 }; m.sideGains.coins += coins; if (gen) m.sideGains.generated.push(gen); return; }
  m.coins += coins; if (gen) m.generated.push(gen);
}
export function onTrick(rng = { next: Math.random }, ownerPersonal = [], ownerCargo = []) {
  return (m, stack, claim) => {
    const live = stack.filter((x) => !x.horizontal && !x.based && !x.tower && !x.inserted && !x.noAbility && !x.placed);   // placed / inserted cards weren't played
    // Sticky Fleece (Silken-, Golden-Fleeced Lamb; D-651): the trick's other captured cards stick together in a bundle; the lamb
    // stays separate; it beats Resurrection (D-193); bundles matter for the player's cargo
    const lamb = live.find((x) => (!x.card.roster || x.card.roster === "main") && x.card.suit === "Farmfolk" && x.card.rank === "Ász" && (x.card.refined || 0) >= 1);
    if (lamb) {
      for (const x of stack) x.resurrect = false;
      const others = stack.filter((x) => x !== lamb && x.card.origin === "enc");
      if (claim.team === 0 && others.length > 1) { const b = { id: "b" + Math.floor(rng.next() * 1e9), golden: lamb.card.refined >= 2 };
        for (const x of others) x.card.bundle = b; matchSay(m, `Sticky Fleece: ${others.length} captured cards stick together in a bundle.`); }
    }             // a sideways play uses no Trick Ability (D-101); Law of the Land
    // Hunting Season (Forester): four different encounter suits in the trick pay its player 4 coins, each Forester (D-318)
    for (const x of live.filter((y) => FOREST.forester(y.card))) if (new Set(stack.map((y) => y.card.suit).filter((su) => !m.suits || m.suits.includes(su))).size >= 4 && x.seat % 2 === 0) { credit(m, x.seat, 4); matchSay(m, "Hunting Season: four kinds of quarry in one trick: 4 coins."); }
    // Virtus: the Calves go straight into the spoils of whoever takes the trick
    for (const x of live) for (let k = 0; k < (x.virtus || 0); k++) m.captured[claim.team].push(card("X", "Plainsfolk", { origin: "enc", generated: true, name: "Calf" }));
    // Great Escape (Plainsfolk Ász): Fugitive returns to its player's hand if the other side takes the trick; Betyár whoever
    // takes it; once per encounter; the winners still capture the rest
    for (const x of live.filter((y) => PLAINS.fugitive(y.card))) {
      m.escaped ??= new Set();
      if (m.escaped.has(x.card.id) || (x.card.refined < 2 && claim.team === x.seat % 2)) continue;
      m.escaped.add(x.card.id); x.escape = true; matchSay(m, `Great Escape: the ${x.card.refined >= 2 ? "Betyár" : "Fugitive"} slips away, back to ${m.names[x.seat]}'s hand.`);
    }
    // Resurrection (Undying Clergy VII): back to its origin deck instead of being captured
    // (Sticky Fleece beats Resurrection, D-193)
    for (const x of live) if (CLERGY.undying(x.card) && !lamb) { x.resurrect = true; matchSay(m, "Resurrection: the Devotee returns to its deck."); }
    // Conversion (Evangelist): one non-Clergy Alsó, Felső or Király in the trick becomes Clergy for good, before the spoils;
    // Proselytising (a refined Clergy X in the converting side's personal deck) adds one (Illuminated) or two (Sacred Tome)
    for (const ev of live.filter((x) => CLERGY.evangelist(x.card))) {
      const extra = ev.seat % 2 === 0 ? Math.max(0, ...ownerPersonal.filter(CLERGY.proselytising).map((x) => x.refined)) : 0;
      for (let k = 0; k < 1 + extra; k++) {
        const el = stack.filter((x) => FACE3.has(x.card.rank) && x.card.suit !== "Clergy" && !(x === stack[0] && x.insulated) && !frozen(stack, x));
        if (!el.length) break;
        const t = el[Math.floor(rng.next() * el.length)];
        setSuit(t.card, "Clergy"); if (t.card.ref) setSuit(t.card.ref, "Clergy"); delete t.revertSuit;
        matchSay(m, `Conversion: the ${t.card.rank} becomes Clergy.`);
      }
    }
    // Pilgrim's Offering (Disciple): +1 coin each when a Clergy Felső or Király is in the trick too
    const offer = live.filter((x) => CLERGY.disciple(x.card)).length;
    if (offer && stack.some((x) => x.card.suit === "Clergy" && (x.card.rank === "Felső" || x.card.rank === "Király"))) {
      if (claim.team === 0) { credit(m, claim.seat, offer); matchSay(m, `Pilgrim's Offering: +${offer} coin${offer === 1 ? "" : "s"} for your side.`); }
    }
    // Merchant's Cut (Fine Cloth, Brocade; D-244, D-274, D-280): if its side takes the trick, the loot sells 5 % (10 %) dearer;
    // additive; attached to the cards
    for (const x of live.filter((y) => TRADES.cloth(y.card))) if (x.seat % 2 === claim.team) {
      const pct = x.card.refined >= 2 ? 10 : 5;
      for (const y of stack) if (y.card.origin === "enc") { y.card.cutPct = (y.card.cutPct || 0) + pct; if (y.card.ref) y.card.ref.cutPct = y.card.cutPct; }
      matchSay(m, `Merchant's Cut: this loot sells ${pct}% dearer.`);
    }
    // Gilded Bait: the coins go to the side that takes the trick
    const baitCoins = stack.reduce((a, x) => a + (x.bait || 0), 0);
    if (baitCoins && claim.team === 0) { credit(m, claim.seat, baitCoins); matchSay(m, `Gilded Bait: +${baitCoins} coins for your side.`); }
    // Apprenticeship (Journeyman): with two Felső of any suit in the trick, one ordinary Tradesfolk card for the player (99 % a
    // VIII, 1 % an X, D-386); once per trick; held until after the match (D-736)
    const jm = live.find((x) => TRADES.journeyman(x.card) && x.seat % 2 === 0);
    if (jm && stack.filter((x) => x.card.rank === "Felső").length >= 2) {
      const rank = rng.next() < 0.99 ? "VIII" : "X";
      const v = COMMODITY_STAGES.filter((x) => x.suit === "Tradesfolk" && x.rank === rank && x.stage === 0 && x.roster !== "secret alternative");
      const pk = v.length ? rng.pick(v) : null, g = pk ? { rank, suit: "Tradesfolk", name: pk.name, roster: pk.roster } : { rank, suit: "Tradesfolk" };
      credit(m, jm.seat, 0, g); matchSay(m, `Apprenticeship: your Journeyman turns out a Tradesfolk ${rank} for you.`);
    }
    // Craftsmanship (Master): one non-Tradesfolk VIII in the trick becomes a Tradesfolk VIII, keeping its upgrades; with none, an
    // ordinary Tradesfolk VIII is made directly beneath the Master
    for (const x of live.filter((y) => TRADES.master(y.card))) {
      const v = stack.find((y) => y.card.rank === "VIII" && y.card.suit !== "Tradesfolk" && !frozen(stack, y) && !(y === stack[0] && insulated(y)));
      if (v) { if (v.card.origin === "pers") { v.revertSuit = v.revertSuit || v.card.suit; v.revertName = v.revertName ?? v.card.name; } setSuit(v.card, "Tradesfolk"); if (v.card.ref && v.card.origin === "enc") setSuit(v.card.ref, "Tradesfolk"); matchSay(m, "Craftsmanship: a VIII in the trick becomes Tradesfolk work."); }
      else if (canInsert(stack, stack.indexOf(x))) { stack.splice(stack.indexOf(x), 0, { seat: x.seat, card: card("VIII", "Tradesfolk", { origin: "enc", generated: true, name: "Cloth" }) }); matchSay(m, "Craftsmanship: the Master makes a bolt of Cloth."); }
    }
    // Criminal Commission (Master Fence): 5 % of the winners' spoils value to its player, rounded up (D-278); after Pillage
    for (const x of live.filter((y) => BANDITS.masterFence(y.card))) if (x.seat % 2 === 0) {
      const v = stack.filter((y) => y.card.origin === "enc" && !y.resurrect && !y.escape).reduce((a, y) => a + (m.value ? m.value(y.card) : 0), 0);
      const n = Math.ceil(v * 0.05); if (n) { credit(m, x.seat, n); matchSay(m, `Criminal Commission: ${n} coin${n === 1 ? "" : "s"} for the Master Fence.`); }
    }
    // Victory Refinement (Hard-Won King's Men VIII played from a hand): refines one stage when its side takes the trick;
    // a Keepsakes reaching Heirloom (or any with an Heirloom in the personal deck) has 5 % for a random X or Ász (D-629)
    for (const x of live.filter((y) => KINGS.hardWon(y.card) && y.seat % 2 === claim.team && !y.copy && !y.placed && !y.card.generated && !y.saved)) {
      const k = x.card; if ((k.refined || 0) >= 2) continue;
      const wasKeep = (k.refined || 0) === 1;
      k.refined = (k.refined || 0) + 1; k.name = ["Spoils", "Keepsakes", "Heirloom"][k.refined]; if (k.ref) { k.ref.refined = k.refined; k.ref.name = k.name; }
      matchSay(m, `Victory Refinement: the ${k.name} is earned.`);
      if (x.seat % 2 === 0 && (wasKeep || [...ownerPersonal, ...ownerCargo].some(KINGS.heirloom)) && rng.next() < 0.05) {
        credit(m, x.seat, 0, { rank: rng.pick(["X", "Ász"]), suit: rng.pick(SUITS12) }); matchSay(m, "Refinement Jackpot! A valuable turns up among the spoils.");
      }
    }
    // Stalking: the prey, if still in the trick, advances one refinement stage before the spoils (never an adjective)
    // Stalking: one randomly chosen eligible upgrade the prey can still take: its next refinement stage or its adjective, never
    // Attrition or one it already has (D-295, D-300)
    for (const x of live.filter((y) => BEASTS.phantom(y.card) && y.prey)) {
      const p = x.prey, target = p.saved ? null : p.card;
      if (!stack.includes(p) || !target || frozen(stack, p)) continue;
      const e = upgradeEntry(target), pool = [];
      if ((target.refined || 0) < maxStage(target)) pool.push("refine");
      if (e && e.adjective && !target.adjective) pool.push("adjective");
      if (!pool.length) continue;
      const pick = rng.pick(pool);
      if (pick === "adjective") target.adjective = e.adjective;
      else { target.refined = (target.refined || 0) + 1; const nm = COMMODITY_STAGES.find((s2) => s2.suit === target.suit && s2.rank === target.rank && s2.roster === (target.roster || "main") && s2.stage === target.refined); if (nm) target.name = nm.name; }
      if (e) target.name = (target.adjective ? target.adjective + " " : "") + e.stages[target.refined || 0];
      if (target.ref) { target.ref.refined = target.refined; target.ref.adjective = target.adjective; target.ref.name = target.name; }
      matchSay(m, `Stalking: the hunted ${target.rank} of ${target.suit} comes out stronger (${pick === "adjective" ? "a new ability" : "refined"}).`);
    }
    restoreIdentities(stack);                                                // Identity Theft, Hallucination, Contamination of personal cards
    // a Fanatic's (or any temporary) change to a personal card lasts only for the trick
    for (const x of stack) if (x.revertSuit) { x.card.suit = x.revertSuit; if (x.revertName !== undefined) { if (x.revertName) x.card.name = x.revertName; else delete x.card.name; } delete x.revertSuit; delete x.revertName; }
    // Harvest Wages: each Seasonal Farmhand in the trick adds +1 coin to the spoils if a Farmfolk VIII or X is present;
    // the side that takes the trick gets it (makk.md)
    const wages = live.filter((x) => FARMFOLK.seasonal(x.card)).length;
    if (wages && stack.some((x) => FARMFOLK.produce(x.card))) {
      if (claim.team === 0) { credit(m, claim.seat, wages); matchSay(m, `Harvest Wages: +${wages} coin${wages === 1 ? "" : "s"} for your side.`); }
      else matchSay(m, `Harvest Wages: ${wages} coin${wages === 1 ? "" : "s"} to the rivals.`);
    }
    // Conscription: a Lord in the trick gives one Farmfolk Alsó in it the Conscript upgrade, for good; control of this trick
    // doesn't change (makk.md)
    if (live.some((x) => FARMFOLK.lord(x.card))) {
      const a = stack.find((x) => isFarm(x.card, "Alsó") && !(x.card.refined >= 1));
      if (a) { a.card.refined = 1; if (a.card.ref) a.card.ref.refined = 1; matchSay(m, `Conscription: the Farmhand becomes a Conscript.`); }
    }
    // Collection Plate (D-246): count every Clergy card in the trick; the trick's winning side gets +1 coin per Clergy
    // card, whichever side played the Clergy IX. Only the player's coins are tracked (NPC wealth isn't modelled).
    for (const { card } of stack) if (CLERGY_IX.collectionPlate(card)) {
      const n = stack.filter((x) => x.card.suit === "Clergy").length;
      if (claim.team === 0) { credit(m, claim.seat, n); matchSay(m, `Collection Plate: ${n} Clergy card${n === 1 ? "" : "s"} in the trick, +${n} coin${n === 1 ? "" : "s"} for your side.`); }
      else matchSay(m, `Collection Plate: the rivals win this trick and its ${n} coin${n === 1 ? "" : "s"}.`);
    }
  };
}

/** D-871: abilities this card should have that the slice doesn't execute, so the interface can say so. An upgraded card
 *  outside the implemented subset behaves as a plain card; it must never look fully functional. */
export function unbuiltAbilities(card) {
  const up = (card.refined || 0) > 0 || !!card.adjective;
  if (!up) return [];
  const isMain = !card.roster || card.roster === "main", k = `${card.suit} ${card.rank}`;
  // Trading Up built (D-943)
  // Checkpoint sabotage built (D-940)
  if (!isMain && upgradeEntry(card)) return [];                         // built alternative lines (D-897)

  if (isMain && card.suit === "Farmfolk") return [];                       // the whole Farmfolk suit is built (makk.md)
  if (isMain && k === "Clergy VIII") return [];   // Field Medicine built (D-938)
  if (isMain && card.suit === "Clergy") return [];                         // the Clergy suit is built (piros.md)
  if (isMain && card.suit === "Tradesfolk") return [];
  if (isMain && card.suit === "Plainsfolk") return [];
  if (isMain && card.suit === "Townsfolk") return [];
  if (isMain && card.suit === "Carnivalfolk") return [];
  if (isMain && card.suit === "Bandits") return [];
  if (isMain && card.suit === "Beasts") return [];
  if (isMain && card.suit === "King's Men") return [];
  if (isMain && card.suit === "Forestfolk") return [];
  if (isMain && card.suit === "Hillfolk") return [];
  if (isMain && card.suit === "Fisherfolk") return [];                     // the Fisherfolk suit is built (fisherfolk.md)                       // the Hillfolk suit is built (hillfolk.md)                     // the Forestfolk suit is built (zold.md; Tracking flagged above)                     // the King's Men suit is built (royal.md)                         // the Beasts suit is built (wild.md)                        // the Bandits suit is built (thug.md)                   // the Carnivalfolk suit is built (carnival.md)                      // the Townsfolk suit is built (urban.md)                     // the Plainsfolk suit is built (plainsfolk.md)                     // the Tradesfolk suit is built (tok.md)
  return ["this card's upgrade abilities (not yet in the game)"];
}
