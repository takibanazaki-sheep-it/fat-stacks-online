// The Zsír match engine (increment 1: plain cards; abilities come in increment 2).
// Rules: traditional Zsír where Fat Stacks says nothing (D-226; docs/reference/zsir-baseline.md), with the documented
// deviations: four participants in two teams, partners opposite (D-149); clockwise; no dealer, random first leader
// (D-201, D-213); hands of 4 encounter + 2 personal cards in separate slots (D-149, D-214); opening deal caller first
// (D-229); capture target = the current bottom card (D-189); the last card matching its rank, or any Seven, claims (a led
// Seven is only matched by Sevens); continuation in every trick by the original caller with a claim-establishing card
// (D-225, D-238), also while their own team holds the claim (D-239); responders with cards must play, empty hands are
// skipped, only the caller may pass (D-217, D-240); refill only between tricks: personal first (player before companion),
// encounter cards to the smallest total hand, ties winner-first clockwise (D-214); shared-deck exhaustion -> one final
// trick (D-217); a completed-trick limit (D-172, D-218); the trick winner leads next (D-201); scoring 10 per captured
// X and Ász, tie -> higher captured encounter-deck value, then a draw (D-281); personal cards are transient (they don't
// change ownership and don't score); only the encounter cards a team captures are spoils (D-219).
//
// Seats: 0 = player, 1 = opponent, 2 = companion (shares the player's personal deck, D-153), 3 = opponent.
// Team of seat s = s % 2 (0: player's team). The engine owns state; decision-makers only pick from legal().

export const ZSIR_RANKS = ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"];
export const isZsir = (c) => c.rank === "X" || c.rank === "Ász";       // "grease": 10 points each
const shuffle = (rng, arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

let NEXT_ID = 1;
export const card = (rank, suit, extra = {}) => ({ id: NEXT_ID++, rank, suit, ...extra });
// an online world keeps its own count, so every client gives each new card the same id (abilities key on ids, D-956)
export function idCounter(v) { if (v != null) NEXT_ID = v; return NEXT_ID; }
// regional progression (D-450, D-406): the engine sets how NPC opponents' own decks and the shared encounter decks are upgraded
// in the current region; each function returns the extra fields (refinement, adjective, name) for one card, or {}
let NPC_UP = null, DECK_UP = null;
export function setProgression(npc, deck) { NPC_UP = npc; DECK_UP = deck; }
const npcCard = (rank, suit) => card(rank, suit, NPC_UP ? NPC_UP(rank, suit) : {});

/** setup: { rng, encounterDeck: [cards], personal: [deckForSeat0and2, deckSeat1, null, deckSeat3], names: [4],
 *  trickLimit, value(card) } -- seat 2 draws from seat 0's personal deck (D-153) */
export function newMatch(setup) {
  const { rng } = setup;
  const mix = (a) => (setup.stacked ? a.reverse() : shuffle(rng, a));   // stacked: tests give decks top-first, unshuffled
  const m = {
    rng, kind: setup.kind || "location", names: setup.names, value: setup.value, trickLimit: setup.trickLimit, suits: setup.suits || null,
    deck: mix(setup.encounterDeck.map((c) => ({ ...c, origin: "enc" }))),
    personal: [0, 1, 2, 3].map((s) => ((s === 2 || s === 3) && !setup.personal[s] ? null : mix((setup.personal[s] || []).map((c) => ({ ...c, origin: "pers", ownerSeat: s }))))),
    hands: [[], [], [], []],
    trick: null, tricksDone: 0, finalTrick: false, ended: false,
    captured: [[], []],            // encounter-deck cards won, per team
    history: [],                   // every completed trick: { stack, team } (checkpoint ownership reads this, D-140)
    generated: [],                 // cards generated during the match for the player, held until the post-match step (D-736)
    onPlay: setup.onPlay || null,  // ability hook: (m, seat, card) after a card is played
    onTrick: setup.onTrick || null,// ability hook: (m, stack, claim) when a trick resolves, before the spoils move
    wanted: setup.wanted || null,
    onHand: setup.onPlay?.onHand || null,   // ability hook: (m, seat, card) when a card enters a hand (Learning the Trade, D-532)
    learnSuit: setup.learnSuit || null,     // the attacker's or challenger's suit in ambushes and duels (D-534)
    command: null,                 // the player's current request to their partner (D-409), cleared when the trick ends  // public: the cards the player's checkpoint asks for (the companion's AI values them)
    coins: 0,                      // coins the player's side earned from abilities during the match
    log: [],
  };
  m.leader = setup.leader ?? Math.floor(rng.next() * 4);   // random among the four (D-213)
  if (setup.hands) { m.hands = setup.hands.map((h) => h.map((c) => ({ ...c, origin: "enc" }))); m.finalTrick = false; }   // dealt by the caller
  else deal(m, true);
  // D-227: an ambush that starts with exactly 16 cards allows two completed tricks although the deal empties the deck:
  // no encounter replenishment, personal replenishment as usual
  if (setup.twoTricksOnSixteen && setup.encounterDeck.length === 16 && !m.deck.length) { m.finalTrick = false; m.trickLimit = Math.min(m.trickLimit, 2); }
  startTrick(m); enterHands(m);
  return m;
}

const team = (s) => s % 2;
// the companion shares its owner's personal deck (D-153); a rival caravan's companion likewise shares that caravan's (D-222)
const personalSource = (m, s) => m.personal[s === 2 && !m.personal[2] ? 0 : s === 3 && !m.personal[3] ? 1 : s];
const nextSeat = (s) => (s + 1) % 4;                     // clockwise (D-213)
const say = (m, text) => m.log.push(text);
const V = (m, s, third, first) => `${m.names[s]} ${s === 0 ? first : third}`;   // "You play" / "Rival A plays"
const teamName = (m, s) => (team(s) === 0 ? "your team" : "the rivals");

// ---------------------------------------------------------------- dealing (D-214, D-229)
function deal(m, opening) {
  for (const s of [0, 2, 1, 3]) {                       // personal first; player before companion on the shared deck
    const src = personalSource(m, s);
    // a duel: the personal deck replaces the encounter deck, so hands refill toward four from it (D-283; D-1230)
    const cap = m.kind === "duel" ? 4 : 2;
    while (src && src.length && m.hands[s].filter((c) => c.origin === "pers").length < cap) m.hands[s].push(src.pop());
  }
  const want = (s) => m.hands[s].filter((c) => c.origin === "enc").length < 4;
  if (opening) {                                         // caller first, then clockwise, one card at a time
    let s = m.leader, guard = 0;
    while (m.deck.length && [0, 1, 2, 3].some(want) && guard++ < 64) { if (want(s)) m.hands[s].push(m.deck.pop()); s = nextSeat(s); }
  } else {                                               // smallest total hand first; ties winner-first, clockwise
    while (m.deck.length) {
      const order = [0, 1, 2, 3].map((k) => (m.leader + k) % 4).filter(want);
      if (!order.length) break;
      const s = order.reduce((a, b) => (m.hands[b].length < m.hands[a].length ? b : a));
      m.hands[s].push(m.deck.pop());
    }
  }
  if (!m.deck.length && !opening) m.finalTrick = true;   // exhaustion: this was the last refill (D-217)
  if (!m.deck.length && opening) m.finalTrick = true;
}

// ---------------------------------------------------------------- the trick
function startTrick(m) {
  if (m.hands.every((h) => !h.length)) return endMatch(m);
  let s = m.leader;
  while (!m.hands[s].length) s = nextSeat(s);            // an empty-handed leader passes the lead on clockwise
  // "the next time" / "the next allied Hillfolk card": Covering Fire and Outfitting wait until used, across tricks, for the rest of
  // the encounter; only effects whose text says "this trick" lapse with it (D-1218)
  const carry = m.trick ? { ...(m.trick.cover ? { cover: m.trick.cover } : {}), ...(m.trick.outfit ? { outfit: m.trick.outfit } : {}) } : {};
  m.trick = { caller: s, stack: [], turn: s, toPlay: [s], phase: "lead", claim: null, rounds: 1, ...carry };
}

// special claim cards (gameplay abilities; a sideways Attrition play disables them, D-102)
const isMain = (c) => !c.roster || c.roster === "main";
// a card under a Courtesan's Distraction loses its lingering effects (protections, Authority; Tradesfolk Ász, TRK-23 audit C)
const live = (e) => !e.horizontal && !e.suppressed;
const isEnforcer = (e) => live(e) && isMain(e.card) && e.card.suit === "Tradesfolk" && e.card.rank === "VII" && (e.card.refined || 0) >= 1;
// the Conscript's capture rule; Pack Instinct gives the Beasts Alpha the same (wild.md)
const isConscript = (e) => !e.horizontal && !e.suppressed && ((isMain(e.card) && (e.card.suit === "Farmfolk" || e.card.suit === "Beasts") && e.card.rank === "Alsó" && (e.card.refined || 0) >= 1)
  || (e.card.roster === "agricultural roster" && e.card.suit === "Beasts" && e.card.rank === "Felső" && (e.card.refined || 0) >= 1 && !e.silenced));   // Pack Instinct: the Toportyán (D-492)
const isDoll = (e) => live(e) && isMain(e.card) && e.card.suit === "Carnivalfolk" && e.card.rank === "VIII" && (e.card.refined || 0) >= 1;
const dollRanks = (e) => (e.card.refined >= 2 ? ["Alsó", "Felső", "Király", "Ász"] : ["Alsó", "Felső"]);
const isHajdu = (e) => !e.horizontal && isMain(e.card) && e.card.suit === "Farmfolk" && e.card.rank === "VII" && (e.card.refined || 0) >= 1;

/** The current claimant, recalculated bottom-up (D-207): the last card matching the bottom card's rank, or any Seven (a led
 *  Seven only by Sevens). Abilities: a Conscript claims against any rank but never from a Seven, and a later matching card
 *  or Seven takes it back (Farmfolk Alsó, makk.md); a Hajdú with a Farmfolk X anywhere in the trick holds a protected claim
 *  that only a later Seven overturns (Herd Guard, D-195, D-234); a card played into an Attrition Lock doesn't claim by
 *  matching rank (D-055). */
export function claimOf(stack, noAuthority = false) {
  if (!stack.length) return null;
  // the Bishop and existing protections (D-190 (1), (3), (4); D-193 (1)): Ecclesiastical Authority doesn't take a claim held
  // under Herd Guard, the Crime Lord's protection or by a Conscript; the claim is worked out without the Authority first (D-1202)
  if (!noAuthority) {
    const auth = authorityOf(stack);
    if (auth) { const base = claimCore(stack, true); return base && base.team !== auth.team && PROTECTED.has(base.reason) ? base : auth; }
  }
  return claimCore(stack, noAuthority);
}
const PROTECTED = new Set(["Herd Guard", "Protection Racket", "Conscript", "Conscript (Knight's Authority)"]);
function authorityOf(stack) {
  // Ecclesiastical Authority (Clergy Király, Archbishop): with at least three other Clergy cards in the trick it claims, and
  // nothing played after it overturns that; it applies retroactively when the third Clergy card arrives (piros.md)
  for (let i = 0; i < stack.length; i++) {
    const e = stack[i];
    if (live(e) && !e.silenced && isMain(e.card) && e.card.suit === "Clergy" && e.card.rank === "Király" && (e.card.refined || 0) >= 1
        && stack.filter((x, j) => j !== i && x.card.suit === "Clergy").length >= 3 && !stack.slice(i + 1).some((x) => x.pierce && live(x) && x.card.rank === "VII"))
      return { index: i, seat: e.seat, team: team(e.seat), card: e.card, reason: "Ecclesiastical Authority" };
  }
  return null;
}
function claimCore(stack, noAuthority) {
  const bottom = stack[0].bike ? { ...stack[0].card, rank: "Király" } : stack[0].card;   // a Bicycle pair leads as a Király (D-780)
  const farmX = stack.some((x) => x.card.suit === "Farmfolk" && x.card.rank === "X");
  // Knight's Authority (King's Men Felső, Knight): a Conscript of the Knight's side can claim despite an EARLIER Seven; a later
  // Seven overrides it normally (D-196)
  const knights = new Set(stack.filter((x) => { const k = x.learned || x.card; return live(x) && isMain(k) && k.suit === "King's Men" && k.rank === "Felső" && (k.refined || 0) >= 1; }).map((x) => team(x.seat)));   // x.learned: an apprentice's copied Felső (D-532)
  // Knight's Authority backs a friendly Farmfolk Conscript only (D-294; royal.md), not an Alpha or a Toportyán (D-1204)
  const backed = (e) => isConscript(e) && e.card.suit === "Farmfolk" && knights.has(team(e.seat));
  // Crew Command (Vajda): every other allied Fisherfolk face card claims whatever its rank, by normal resolution (D-380)
  const vajdas = stack.filter((x) => live(x) && !x.silenced && isMain(x.card) && x.card.suit === "Fisherfolk" && x.card.rank === "Király" && (x.card.refined || 0) >= 1);
  const crew = (e) => ["Alsó", "Felső", "Király", "Ász"].includes(e.card.rank) && e.card.suit === "Fisherfolk" && live(e) && vajdas.some((v) => v !== e && team(v.seat) === team(e.seat));
  const cutBy = (e) => e.cut && stack.includes(e.cut) && live(e.cut) && !e.cut.silenced;            // Claim Suppression (D-538)
  // an inserted card at the bottom (Grinding's Wheat) is the card to match but can't hold a claim: the first played card does
  const first = stack.findIndex((x) => !x.inserted && !x.tower);
  // Tenacious (Badger): no claim but a matching rank's, Sevens and ability claims included, by the top card directly above it, until
  // another card covers it; the Ebborz also above later Beasts cards (D-498, D-499, D-905, D-909)
  const ten = (x) => x && x.tenacious && live(x) && !x.silenced;
  const blocked = (i) => i === stack.length - 1 && i >= 1 && (ten(stack[i - 1]) || (stack[i - 1].card.suit === "Beasts" && stack.slice(0, i - 1).some((x) => ten(x) && x.tenacious.ebborz)));
  // Arbitration / Mesmerise (D-615, D-627): a kept claim stands against the cards in the trick when it was kept
  let who = first < 0 || stack[first].discon || stack[first].falseClaim || (cutBy(stack[first]) && !stack[first].keep) ? -1 : first, guarded = false, shield = bottom.rank === "VII" && isEnforcer(stack[0]) && !stack[0].silenced, how = "led card";
  // Herd Guard "regardless of order or bottom card" (makk.md): a led Hajdú with a Farmfolk X in the trick holds a protected claim
  // too (D-1212)
  if (who >= 0 && isHajdu(stack[who]) && !stack[who].suppressed && !stack[who].silenced && farmX) { guarded = true; how = "Herd Guard"; }
  for (let i = Math.max(1, first + 1); i < stack.length; i++) {
    const e = stack[i], c = e.card;
    if (e.tower || e.inserted) continue;                   // Erection's tower, a horse's inserted cards: no claims
    // Piercing Claim (Harpooner): no claim protection stops it, nor Silence or Defiance (D-626, D-641 (7)); only what stops its own
    // ability on play does (then it never gets the mark)
    const pierce = e.pierce && live(e) && c.rank === "VII";
    if (pierce) { who = i; shield = false; guarded = false; how = "Piercing Claim"; continue; }
    if (who >= 0 && stack[who].keep && stack[who].keep.has(e)) continue;
    if (e.keep) { who = i; shield = false; guarded = false; how = "kept claim"; continue; }
    if (cutBy(e) || e.discon || e.falseClaim || e.decoy) continue;   // Claim Suppression; Disconcerting (D-511); False Claim; Tempting's decoy
    const bl = blocked(i);
    if (bl && !(c.rank === bottom.rank && !e.noClaim)) continue;   // Tenacious lets only a matching rank through (D-909)
    // an Archbishop silenced by Defiance keeps the claim it had, as an ordinary claim (D-627)
    if (!noAuthority && isMain(c) && c.suit === "Clergy" && c.rank === "Király" && (c.refined || 0) >= 1 && live(e) && stack.filter((x, j) => j !== i && x.card.suit === "Clergy").length >= 3) { who = i; how = e.silenced ? "Ecclesiastical Authority (defied)" : "Ecclesiastical Authority"; continue; }
    // Written Protection (Prepared Parchment): the protected Clergy claim can't be taken by the other side this round (D-571)
    const holder = who >= 0 ? stack[who] : {}, walled = (holder.prot || holder.guard) && live(holder) && !holder.silenced && team(e.seat) !== team(holder.seat);
    // Stubborn Roots (Hulled Millet): another commodity can't take its claim (D-560)
    const rooted = holder.roots === "keep" && live(holder) && !holder.silenced && (c.rank === "VIII" || c.rank === "X");
    if (walled || rooted) continue;
    // Indulgence (Authentic Aszú): this card establishes a claim whether or not it would qualify; not against a prohibition (D-564)
    if (e.indulged && !e.noClaim && !guarded && !bl) { who = i; shield = false; how = "Indulgence"; continue; }
    // Home Advantage claims by the copied rank; Make-Believe (Jointed Doll: Alsó or Felső; Marionette: any face rank) claims
    // as whichever allowed face rank takes it (D-742)
    // Lekking claims as the copied rank, as a Seven when it copies a VII (D-521)
    const rk = (live(e) && e.claimRank) || c.rank;
    const corrMatch = c.suit === "Corruption" && bottom.suit === "Corruption" && c.corr !== "peter" && bottom.corr !== "peter";
    const matching = !e.noClaim && (corrMatch || c.rank === bottom.rank || (!bl && (rk === bottom.rank || (isDoll(e) && dollRanks(e).includes(bottom.rank)) || crew(e))));
    if (rk === "VII" && (c.rank === "VII" || !bl)) {
      // Superior Equipment blocks a Seven only when the capture target is a Seven (your ruling, 2026-11-20: "no 7 is blocked, unless
      // the capture target card is a 7"; D-1203)
      if (shield && bottom.rank === "VII") { shield = false; continue; }
      who = i; guarded = isHajdu(e) && !e.suppressed && !e.silenced && farmX; shield = isEnforcer(e) && !e.silenced;   // Silence ends protections (D-641)
      how = guarded ? "Herd Guard" : bottom.rank === "VII" ? "matching rank" : "Seven"; continue;
    }
    if (guarded) continue;                                   // only a later Seven overturns a Herd Guard claim
    if (e.racket && live(e) && !e.silenced && !bl) { who = i; shield = false; how = "Protection Racket"; continue; }   // Crime Lord (thug.md)
    if (matching) { who = i; shield = false; how = c.rank === bottom.rank || rk === bottom.rank ? "matching rank" : crew(e) ? "Crew Command" : "matching rank"; continue; }   // a matching card bypasses the equipment
    // a granted Conscript ability (To Arms!) claims the same way, but isn't a Farmfolk Conscript for Knight's Authority (D-631)
    if (!bl && (isConscript(e) || (e.conscripted && live(e))) && (!stack.slice(0, i).some((x) => !x.horizontal && (x.card.rank === "VII" || (live(x) && x.claimRank === "VII"))) || backed(e))) { who = i; shield = false; how = backed(e) ? "Conscript (Knight's Authority)" : "Conscript"; }
  }
  // Disconcerting's dead end: nothing can claim, so the caller takes the trick (D-511)
  const cs = stack.find((x) => x.callerSeat !== undefined);
  if (who < 0 && cs && !stack.some((x) => x.cut)) {
    const k = stack.findIndex((x) => x.seat === cs.callerSeat); if (k >= 0) return { index: k, seat: stack[k].seat, team: team(stack[k].seat), card: stack[k].card, reason: "caller (Disconcerting)" };
  }
  if (who < 0) { const ms = stack.findIndex((x) => stack[0].cut === x); who = ms >= 0 ? ms : 0; how = "Claim Suppression"; }
  else if (stack[who].cut && cutBy(stack[who]) && !stack[who].keep) { const ms = stack.indexOf(stack[who].cut); who = ms; how = "Claim Suppression"; }
  return { index: who, seat: stack[who].seat, team: team(stack[who].seat), card: stack[who].card, reason: how };
}

/** would this card take the claim if played now? (D-238: continuation legality is claim-based, abilities included) */
export function claims(stack, c, seat = 0) {   // the seat matters: team-dependent rules (protections, Crew Command, Knights) (D-1228)
  if (!stack.length) return true;
  return claimOf([...stack, { seat, card: c }]).index === stack.length;
}
// the same for a given seat, honouring a Lock that binds that seat's turn (D-055: a Seven still captures)
function claimsFor(m, seat, c) {
  const t = m.trick;
  if (t.lock && t.lock.seat === seat && c.rank === t.stack[0]?.card.rank && c.rank !== "VII") return false;
  return claims(t.stack, c, seat);
}

// ---------------------------------------------------------------- Attrition (D-053 to D-056, D-101 to D-103, D-215, D-304, D-313 to D-316)
export const ATTRITION = {
  VII: "Draw Two: the next player draws two and loses their turn, unless they pass it on with their own Attrition Seven",
  VIII: "Double Play: play one more card at once",
  IX: "Rank Request: the next player must play the rank you name, or draw one and lose their turn",
  X: "Lock: the next player can't take the card to match with a card of its rank (a Seven still can)",
  "Alsó": "Face-Card Request: the next player must play an Alsó, Felső, Király or Ász, or draw one and lose their turn",
  "Felső": "Suit Request: the next player must play the suit you name, or draw one and lose their turn",
  "Király": "Cancel: ends any Attrition effect in play",
  "Ász": "Skip: the next player loses their turn",
};
const FACE = new Set(["Alsó", "Felső", "Király", "Ász"]);                // D-304
const complies = (p, c) => p.kind === "rank" ? c.rank === p.value : p.kind === "suit" ? c.suit === p.value : p.kind === "face" ? FACE.has(c.rank) : true;
const playAct = (c) => ({ type: "play", card: c, canHorizontal: !!c.attrition });
const ar = (c) => c.attrRank || c.rank;
const drawable = (a) => a.filter((c) => c.corr !== "glitched");
// the Bicycle (Corruption, D-780): never played alone; it goes down together with an Alsó, Felső or Ász in the same turn, and the
// pair counts as one Király until the end of the trick (reading, D-780: one play for both); the paired card scores as normal
const isBike = (c) => c.corr === "bicycle";
const BIKE_MATES = new Set(["Alsó", "Felső", "Ász"]);
function withBikes(hand, acts) {
  const bike = hand.find(isBike), out = acts.filter((a) => !isBike(a.card));
  if (bike) for (const a of acts) if (BIKE_MATES.has(a.card.rank) && !a.mustHorizontal) out.push({ type: "play", card: a.card, with: bike, canHorizontal: false });
  return out;
}   // a glitched Corruption card is never drawn (D-751)                    // a stray UNO card's sideways ability (Corruption, D-754)

// Carnivalfolk play constraints (carnival.md), each "if able": Hear Ye! (play the announced suit), Right of Way (a suit other
// than the card beneath the Travel Pass), Intimidation (one of your highest-value cards)
// Conflicting forced plays (D-522, D-523): the effect binding more players takes precedence; on a tie the one that started earlier.
// Each is applied "if able", in that order, so a later one only narrows within what the stronger ones left. An effect's start is
// stamped when the engine first sees it (the legal-move check right after the card that set it)
function constrain(m, s, cards, req = null) {
  let out = cards;
  const narrow = (pred) => { const k = out.filter(pred); if (k.length) out = k; };
  const live = [];   // pure: start times are stamped by act (stampEffects), never here, so asking what's legal changes nothing
  if (m.hearYe && m.hearYe.by !== s) live.push({ x: m.hearYe, scope: 3, apply: () => narrow((c) => c.suit === m.hearYe.suit) });   // every later player
  if (m.rightOfWay && m.rightOfWay.by !== s) live.push({ x: m.rightOfWay, scope: 1, apply: () => narrow((c) => c.suit !== m.rightOfWay.suit) });   // the next player
  if (m.lek && m.lek.seat === s) live.push({ x: m.lek, scope: 1, apply: () => narrow((c) => c.rank === "Ász") });   // Lekking (Túzok): the next player
  if (m.intimidate && m.intimidate.by !== s) live.push({ x: m.intimidate, scope: m.intimidate.once ? 1 : 3,
    apply: () => { const top = Math.max(...out.map((c) => m.value(c))); narrow((c) => m.value(c) === top); } });
  // an Attrition request is one of these forced plays, binding one player (your answer, D-1247): ranked with them by D-522
  if (req) live.push({ x: req, scope: 1, apply: () => narrow((c) => complies(req, c)) });
  live.sort((a, b) => b.scope - a.scope || (a.x.at ?? 1e9) - (b.x.at ?? 1e9));
  // the stronger effect wins a conflict: a weaker one that would leave no card the stronger allows is dropped (narrow keeps out)
  for (const e of live) e.apply();
  return out;
}
/** whose decision is it and what may they do */
export function legal(m) {
  if (m.ended) return { seat: null, actions: [] };
  const t = m.trick, s = t.turn, hand = m.hands[s], p = m.pending && m.pending.seat === s ? m.pending : null;
  if (t.extra === s) return { seat: s, kind: "extra", actions: withBikes(hand, constrain(m, s, hand).map(playAct)) };   // Double Play
  if (p && !(t.phase === "continue" && ["rank", "suit", "face"].includes(p.kind))) {                 // D-316: continuations unbound
    if (p.kind === "draw") return { seat: s, kind: "penalty", pending: p, actions: [
      ...hand.filter((c) => c.attrition && (ar(c) === "VII" || ar(c) === "Király")).map((c) => ({ type: "play", card: c, mustHorizontal: true, canHorizontal: true })),
      { type: "penalty", draw: p.count }] };
    if (p.kind === "skip") return { seat: s, kind: "penalty", pending: p, actions: [
      ...hand.filter((c) => c.attrition && (ar(c) === "Ász" || ar(c) === "Király")).map((c) => ({ type: "play", card: c, mustHorizontal: true, canHorizontal: true })),
      { type: "penalty", draw: 0 }] };
    // no card meets the request: draw one and lose the turn; otherwise the request ranks with the other forced plays (D-522,
    // D-523): a stronger one that leaves no complying card drops it (your answer, D-1247)
    const base = hand.filter((c) => !isBike(c) && (t.phase !== "continue" || claimsFor(m, s, c)));
    if (!base.some((c) => complies(p, c))) return { seat: s, kind: "penalty", pending: p, actions: [{ type: "penalty", draw: 1 }] };
    return { seat: s, kind: t.phase, pending: p, actions: constrain(m, s, base, p).map(playAct) };
  }
  if (t.phase === "lead" || t.phase === "respond") return { seat: s, kind: t.phase, actions: withBikes(hand, constrain(m, s, hand).map(playAct)) };
  if (t.phase === "continue") {                          // the caller: continue with a claiming card, or Pass (D-217, D-238, D-239)
    // Hear Ye!, Right of Way and Intimidation bind this turn too, "if able" among the claiming cards (your ruling, 2026-11-04;
    // D-238: continuation legality accounts for restrictions)
    const opts = constrain(m, s, hand.filter((c) => !isBike(c) && claimsFor(m, s, c))).map(playAct);
    return { seat: s, kind: "continue", actions: [...opts, { type: "pass" }] };
  }
  return { seat: null, actions: [] };
}

/** cards that entered a hand since the last action meet the onHand hook, in seat and hand order (deterministic) */
function enterHands(m) {
  if (!m.onHand) return;
  for (let s = 0; s < 4; s++) for (const c of m.hands[s]) if (!c.entered) { c.entered = true; m.onHand(m, s, c); }
}
/** forced-play effects get their start order when they begin, inside a move every copy applies alike (D-522; online copies must
 *  never differ because one screen asked what was legal and another didn't, D-956) */
function stampEffects(m) {
  for (const x of [m.hearYe, m.rightOfWay, m.lek, m.intimidate, m.pending]) if (x && x.at == null) x.at = m.cseq = (m.cseq || 0) + 1;
}
export function act(m, seat, action) { try { return actInner(m, seat, action); } finally { enterHands(m); stampEffects(m); } }
function actInner(m, seat, action) {
  const L = legal(m);
  if (seat !== L.seat) throw new Error(`not seat ${seat}'s turn`);
  const t = m.trick;
  if (action.type === "pass") {
    if (L.kind !== "continue") throw new Error("only the caller may pass, when play returns to them");
    say(m, `${V(m, seat, "passes", "pass")}.`); return resolveTrick(m);
  }
  if (action.type === "penalty") {                       // draw from the encounter deck (D-314) and lose this turn (D-053)
    const a = L.actions.find((x) => x.type === "penalty"); if (!a) throw new Error("no penalty to take");
    const n = Math.min(a.draw, m.deck.length);
    for (let k = 0; k < n; k++) m.hands[seat].push(m.deck.pop());
    say(m, `${V(m, seat, "loses", "lose")} the turn${a.draw ? ` and ${seat === 0 ? "draw" : "draws"} ${n}` : ""} (Attrition).`);
    m.pending = null; if (t.lock && t.lock.seat === seat) t.lock = null;
    if (t.phase === "continue") return resolveTrick(m);
    return advance(m, seat);
  }
  const c = m.hands[seat].find((x) => x.id === action.card.id);
  const la = c && L.actions.find((a) => a.type === "play" && a.card.id === c.id && (a.with?.id ?? null) === (action.with?.id ?? null));
  if (!la) throw new Error("illegal card");
  const horizontal = !!(action.horizontal || la.mustHorizontal);
  if (horizontal && !c.attrition) throw new Error("this card has no Attrition upgrade (D-101)");
  const facing = m.pending && m.pending.seat === seat ? m.pending : null;
  m.hands[seat].splice(m.hands[seat].indexOf(c), 1);
  if (la.with) m.hands[seat].splice(m.hands[seat].indexOf(la.with), 1);       // the Bicycle goes down with it
  if (t.phase === "continue") t.rounds = (t.rounds || 1) + 1;   // the caller's continuation starts a new round
  const entry = { seat, card: c, horizontal, ...(la.with ? { claimRank: "Király", bike: la.with } : {}) };
  if (t.lock && t.lock.seat === seat && c.rank === t.stack[0]?.card.rank && c.rank !== "VII") entry.noClaim = true;
  t.stack.push(entry);
  // Carnivalfolk constraints end: Hear Ye! and a Dancing Bear when play comes back to their player; Right of Way and a
  // Trained Bear after the next player's card
  if (m.hearYe && m.hearYe.by === seat) m.hearYe = null;
  if (m.rightOfWay && m.rightOfWay.by !== seat) m.rightOfWay = null;
  if (m.intimidate && (m.intimidate.by === seat || m.intimidate.once)) m.intimidate = null;
  if (t.lock && t.lock.seat === seat) t.lock = null;                     // a Lock lasts for the next player's turn only (D-055)
  if (facing) m.pending = null;
  if (t.extra === seat) t.extra = null;
  // Another Round! (Tavern Keeper): the next player to play must play one more card into the same trick, if they can
  if (t.anotherRound != null && t.anotherRound !== seat) { t.anotherRound = null; if (m.hands[seat].length) { t.extra = seat; say(m, `Another Round! ${m.names[seat]} must play one more card.`); } }
  const cl = claimOf(t.stack); t.claim = cl;
  say(m, `${V(m, seat, "plays", "play")} ${c.name ? c.name + ` (${c.rank} of ${c.suit})` : `${c.rank} of ${c.suit}`}${c.origin === "pers" ? " from the personal deck" : ""}${horizontal ? " sideways (Attrition)" : ""}${cl && cl.seat === seat && t.stack.length > 1 && !t.lost ? ` and ${seat === 0 ? "take" : "takes"} the claim (${cl.reason})` : ""}${entry.noClaim ? ", but the Lock stops it claiming" : ""}.`);
  if (la.with) say(m, `…on a Bicycle: the pair counts as one Király until the end of the trick.`);
  // a sideways play doesn't use the card's own Trick Ability (D-101), but the other cards' reactions and orientation-free
  // effects still see it (D-103; D-1229): the hook runs, and skips the card's own trick ability
  if (m.onPlay) m.onPlay(m, seat, c);
  t.claim = claimOf(t.stack);
  let next = null;
  if (horizontal) next = attrition(m, seat, c, action, facing);
  if (t.extra === seat && m.hands[seat].length) return;                  // Double Play: the same player plays again
  t.extra = null;
  m.pendingNext = next && !next.lock ? next : null;
  advance(m, seat);
  m.pendingNext = null;
  if (next && !m.ended && m.trick === t) {
    if (next.lock) t.lock = { seat: t.turn };
    else m.pending = { ...next, seat: t.turn };
    say(m, `${m.names[t.turn]} ${pendingText(next)}.`);
  }
}

function attrition(m, seat, c, action, facing) {
  const t = m.trick;
  switch (ar(c)) {
    case "VII": { const n = (facing?.kind === "draw" ? facing.count : 0) + 2; say(m, `Draw Two${n > 2 ? `, stacked to ${n}` : ""}!`); return { kind: "draw", count: n }; }
    case "VIII": say(m, "Double Play: another card at once."); t.extra = seat; return null;
    case "IX": { const r = action.request || "Ász"; say(m, `Rank Request: ${r}.`); return { kind: "rank", value: r }; }
    // Lock protects the current capture target, whatever its rank, for the next player's turn (D-055; R-03; D-1227)
    case "X": { const tg = t.stack[0]?.card.rank; say(m, `Lock: no ${tg || "X"} may take the card to match on the next turn (a Seven still can).`); return { lock: true, kind: "lockonly", value: tg }; }
    case "Alsó": say(m, "Face-Card Request."); return { kind: "face" };
    case "Felső": { let su = action.request || c.suit;   // Corruption can never be named as a suit (card-system.md; D-1234)
      if (su === "Corruption") su = (t.stack.find((x) => x.card.suit !== "Corruption") || {}).card?.suit || (m.suits || ["Farmfolk"])[0];
      say(m, `Suit Request: ${su}.`); return { kind: "suit", value: su }; }
    case "Király": m.pending = null; t.lock = null; say(m, "Cancel: Attrition effects end."); return null;
    case "Ász": say(m, facing?.kind === "skip" ? "Skip, passed on!" : "Skip!"); return { kind: "skip" };
    case "monster": {                                      // Summoned Monster sideways: your side's claim can't be taken this trick (D-1190)
      const cl = claimOf(t.stack.slice(0, -1)); const h = cl && t.stack[cl.index];
      if (h && team(h.seat) === team(seat)) { h.guard = true; say(m, "The Summoned Monster stands guard: your side's claim can't be taken for the rest of the trick."); }
      else say(m, "The Summoned Monster has no claim of your side's to guard.");
      return null;
    }
  }
  return null;
}
function pendingText(p) {
  return { draw: `must draw ${p.count} and lose the turn, unless they pass it on`, skip: "loses the turn", rank: `must play a ${p.value}, or draw one and lose the turn`,
           face: "must play a face card, or draw one and lose the turn", suit: `must play a ${p.value} card, or draw one and lose the turn`, lockonly: `can't take the card to match with a matching rank this turn` }[p.kind] || "";
}

function advance(m, seat) {
  const t = m.trick;
  // the round goes clockwise from the caller; seats with no cards are skipped (D-240)
  let s = nextSeat(seat);
  while (s !== t.caller && !m.hands[s].length) s = nextSeat(s);
  if (s !== t.caller) { t.turn = s; t.phase = "respond"; return; }
  // every round's end, an extra round included: round-end effects (Forewarning) and Bottom Feeding's return come first (D-650,
  // D-652; D-1204)
  if (t.roundEnd) t.roundEnd = t.roundEnd.filter((f) => !f(m));
  for (const f of t.fed || []) t.stack.splice(Math.min(f.depth, t.stack.length), 0, f.entry); t.fed = null;
  // By Royal Decree! (King's Men IX, Royal): the trick gets one more full round of four plays from the original starter
  if (t.decree && !t.decreeDone) {
    t.decreeDone = true; t.rounds = (t.rounds || 1) + 1; let f = t.caller, k = 0;
    while (!m.hands[f].length && k++ < 4) f = nextSeat(f);
    if (m.hands[f].length) { t.turn = f; t.phase = "respond"; say(m, "By Royal Decree! Another round of plays."); return; }
  }
  // (Forewarning: at the end of the round after the Recluse's, Hillfolk cards above the card to match move to the top; run above)
  // Final Nail, Cash Out (the trick ends with this round) and Let It Ride (the caller must start another); the later card decides;
  // By Royal Decree!'s extra round above comes first (D-588, D-656)
  const rule = t.roundRule; t.roundRule = null;
  if (rule && rule.kind === "stop") { say(m, "The round is over, and so is the trick."); return resolveTrick(m); }
  if (rule && rule.kind === "force") {
    let f = t.caller, k = 0; while (!m.hands[f].length && k++ < 4) f = nextSeat(f);
    if (m.hands[f].length) { t.rounds += 1; t.turn = f; t.phase = "respond"; say(m, "Let It Ride: another round, like it or not."); return; }
    return resolveTrick(m);
  }
  // (Bottom Feeding's cards came back above, before any next round, D-650)
  // back at the caller: continuation possible only with a claiming card (D-238)
  t.turn = t.caller;
  if (m.hands[t.caller].some((c) => claimsFor(m, t.caller, c)) || (m.pendingNext && (m.pendingNext.kind === "draw" || m.pendingNext.kind === "skip"))) t.phase = "continue";
  else { say(m, `${m.names[t.caller]} can't continue: no card that would claim.`); resolveTrick(m); }
}

function resolveTrick(m) {
  const t = m.trick;
  // Silver Ingots: 1 coin per round of the trick; Gold Ingots: 10 - 1 per round (never below 0); to whoever played them (D-588)
  for (const g of t.ingots || []) { const n = g.silver ? t.rounds : Math.max(0, 10 - t.rounds); if (n && team(g.seat) === 0) { m.coins = (m.coins || 0) + n; say(m, `${g.silver ? "Let It Ride" : "Cash Out"}: ${n} coin${n === 1 ? "" : "s"} for ${m.names[g.seat]}.`); } }
  for (const f of t.fed || []) t.stack.splice(Math.min(f.depth, t.stack.length), 0, f.entry); t.fed = null;   // Bottom Feeding
  for (const f of t.endHooks || []) f(m);                 // Set Trap, at the very end, before the Fox's return and the award
  // Pilfering: the taken cards come back just before the trick is awarded, at their old depth or on top (D-491); not a new play
  for (const p of t.pilfered || []) { if (p.top) t.stack.push(p.entry); else t.stack.splice(Math.min(p.depth, t.stack.length), 0, p.entry);
    say(m, `The fox drops the ${p.entry.card.name || p.entry.card.rank + " of " + p.entry.card.suit} back ${p.top ? "on top" : "where it was"}.`); }
  t.pilfered = null;
  let cl = claimOf(t.stack);
  if (m.onTrick) cl = m.onTrick(m, t.stack, cl) || cl;    // end-of-trick effects may change the winner (Conversion, D-193)
  // the truffle-summoned Tusker wins (D-187, D-211): nobody captures; Great Escape and Resurrection still act; the encounter cards
  // are discarded for good; personal cards return as transient; the next lead is random among the four
  if (cl.seat < 0) {
    for (const x of t.stack) if (x.resurrect && x.card.origin === "enc") m.deck.splice(Math.floor(m.rng.next() * (m.deck.length + 1)), 0, x.card);
    for (const x of t.stack) if (x.escape) m.hands[x.seat].push(x.card);
    for (const h of m.hands) for (let k = h.length - 1; k >= 0; k--) if (h[k].vanish) h.splice(k, 1);
    for (const x of t.stack) if (x.card.origin === "pers" && !x.escape) { returnPersonal(m, x.card); m.playUsed?.delete(x.card.id); }   // back to its deck: reset (D-058)
    m.tricksDone += 1;
    say(m, `Trick ${m.tricksDone}: the Tusker wins it, and the trick is lost to everyone.`);
    m.lastTrick = { stack: t.stack, winner: -1, team: -1 }; m.history.push(m.lastTrick);
    m.command = null; m.command1 = null; m.pending = null; m.leader = Math.floor(m.rng.next() * 4);
    if (m.finalTrick || m.tricksDone >= m.trickLimit) return endMatch(m);
    deal(m, false); return startTrick(m);
  }
  for (const x of t.stack) if (x.resurrect && x.card.origin === "enc") { m.deck.splice(Math.floor(m.rng.next() * (m.deck.length + 1)), 0, x.card); m.playUsed?.delete(x.card.id); }   // Resurrection: back to its deck, reset (D-058)
  for (const x of t.stack) if (x.escape) m.hands[x.seat].push(x.card);   // Great Escape: back to the player's hand
  const enc = t.stack.filter((x) => x.card.origin === "enc" && !x.resurrect && !x.escape).map((x) => x.card);
  m.captured[cl.team].push(...enc);                      // encounter cards are the spoils; personal cards are transient
  if (m.capturedBySeat) m.capturedBySeat[cl.seat].push(...enc);   // a shared match: the winning seat keeps them (D-914)
  for (const h of m.hands) for (let k = h.length - 1; k >= 0; k--) if (h[k].vanish) h.splice(k, 1);   // Raise the Alarm's unplayed Volunteer (D-614)
  for (const x of t.stack) if (x.card.origin === "pers" && !x.escape) { returnPersonal(m, x.card); m.playUsed?.delete(x.card.id); }   // back to its deck: reset (D-058)
  m.tricksDone += 1;
  say(m, `Trick ${m.tricksDone} to ${teamName(m, cl.seat)} (${m.names[cl.seat]}, ${cl.reason}): ${enc.length} encounter card${enc.length === 1 ? "" : "s"}${enc.some(isZsir) ? `, ${enc.filter(isZsir).length * 10} points` : ""}.`);
  m.lastTrick = { stack: t.stack, winner: cl.seat, team: cl.team };
  m.history.push(m.lastTrick);
  m.command = null; m.command1 = null; m.pending = null;                     // Attrition effects don't outlast the trick
  m.leader = cl.seat;                                     // the winner leads next (D-201)
  if (m.finalTrick || m.tricksDone >= m.trickLimit) return endMatch(m);
  deal(m, false);
  startTrick(m);
}

// a played personal card leaves the match and goes back to its owner's deck afterwards (transient)
function returnPersonal(m, c) { (m.returned ??= []).push(c); }

export function score(m, tm) {
  const pts = m.captured[tm].filter(isZsir).length * 10;
  const val = m.captured[tm].reduce((a, c) => a + m.value(c), 0);
  return { points: pts, value: val };
}

function endMatch(m) {
  m.ended = true; m.trick = null;
  if (m.kind === "duel") {                               // a duel is decided by confrontation points (D-186, D-197)
    const o = duelOutcome(m); m.result = o.result; m.duelPts = o.pts;
    return say(m, `Duel over after ${m.tricksDone} trick${m.tricksDone === 1 ? "" : "s"}: ${o.pts[0]}–${o.pts[1]} in confrontation points. ${o.result === "win" ? "Your side wins." : o.result === "lose" ? "Your side loses." : "A friendly handshake."}`);
  }
  const a = score(m, 0), b = score(m, 1);
  m.result = a.points !== b.points ? (a.points > b.points ? "win" : "lose")
           : a.value !== b.value ? (a.value > b.value ? "win" : "lose") : "draw";   // D-281
  say(m, `Match over after ${m.tricksDone} trick${m.tricksDone === 1 ? "" : "s"}: ${a.points}–${b.points} points${a.points === b.points ? ` (value ${a.value}–${b.value})` : ""}. ${m.result === "win" ? "Your team wins." : m.result === "lose" ? "Your team loses." : "A draw."}`);
}

// ---------------------------------------------------------------- baseline AI (same legal actions as a human)
// Traditional Zsír play, not a rule: only X and Ász score, so a trick with none on it (száraz, "dry") is worth little;
// Sevens are the scarce wild cards: keep them for tricks with points (zsír) or for the last trick, never waste them on a
// dry trick. In Fat Stacks the player's side also keeps every card it captures as cargo, so for the player's companion a
// card the checkpoint asks for (D-875) on the table counts a little too. Any decision-maker may replace this.
export function aiChoose(m, seat) {
  const L = legal(m);
  if (L.kind === "penalty") {                            // counter if it can (stack, pass on, cancel), else take the penalty
    const ctr = L.actions.find((x) => x.type === "play");
    return ctr ? { type: "play", card: ctr.card, horizontal: true } : { type: "penalty" };
  }
  if (L.kind === "extra") {
    const cs = L.actions.map((x) => x.card).sort((x, y) => (isZsir(x) - isZsir(y)) || (m.value(x) - m.value(y)));
    return { type: "play", card: cs[0] };
  }
  let choice = withAttrition(m, seat, aiChooseInner(m, seat));
  // a constraint (Hear Ye!, Right of Way, Intimidation) can rule out what a heuristic picked: fall back to a legal card
  if (choice.type === "play" && !L.actions.some((a) => a.card === choice.card)) {
    const ok = L.actions.filter((a) => a.type === "play").map((a) => a.card).sort((x, y) => (isZsir(x) - isZsir(y)) || (m.value(x) - m.value(y)));
    choice = ok.length ? { type: "play", card: ok[0] } : L.actions[0];
  }
  return choice;
}

// whether to play a card with Attrition sideways (D-101): only against an opponent who plays next, and only where the
// effect hurts them; a plain heuristic, not a rule
function withAttrition(m, seat, ch) {
  if (ch.type !== "play" || !ch.card.attrition) return ch;
  const t = m.trick; let nx = nextSeat(seat); while (nx !== seat && !m.hands[nx].length) nx = nextSeat(nx);
  if (team(nx) === team(seat)) return ch;
  const r = ar(ch.card);
  if (r === "IX") return { ...ch, horizontal: true, request: "Ász" };
  if (r === "Felső") { const have = new Set(m.hands[seat].map((c) => c.suit)); const su = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Plainsfolk", "Townsfolk", "Bandits", "Beasts"].find((x) => !have.has(x)) || ch.card.suit; return { ...ch, horizontal: true, request: su }; }
  if (["VII", "Alsó", "Ász"].includes(r)) return { ...ch, horizontal: true };
  if (r === "X" && (t.stack.length === 0 || claimOf(t.stack)?.team === seat % 2)) return { ...ch, horizontal: true };   // Lock: lead an X under it, or guard your side's claim (D-055)
  return ch;
}

function aiChooseInner(m, seat) {
  const own = baseChoice(m, seat);
  // each side's AI partner follows its own side's call: seat 2 the player's (m.command), seat 3 the other side's (m.command1) (D-409; D-1232)
  const cmd = seat === 2 ? m.command : seat === 3 ? m.command1 : null;
  if (!cmd || m.ended) return own;
  const f = followCommand(m, seat, own, cmd);
  if (f && (f.type !== own.type || f.card !== own.card)) say(m, `${m.names[seat]} follows ${seat === 2 ? "your" : "the"} call.`);
  return f || own;
}

// the AI partner follows a request when it legally can (D-409: it may also ignore it; here it ignores only what it can't do)
function followCommand(m, seat, own, cmd) {
  const L = legal(m), t = m.trick, hand = m.hands[seat];
  const plays = L.actions.filter((a) => a.type === "play").map((a) => a.card);
  const cl = t.stack.length ? claimOf(t.stack) : null, ours = cl && cl.team === team(seat);
  const pick = (cs) => cs.slice().sort((x, y) => m.value(x) - m.value(y))[0];
  const takes = plays.filter((c) => t.stack.length && claims(t.stack, c, seat));
  switch (cmd) {
    case "add": { const z = plays.filter(isZsir); if (ours && z.length && L.kind !== "continue") return { type: "play", card: z[0] }; return null; }
    case "noadd": if (own.type === "play" && isZsir(own.card)) { const o = plays.filter((c) => !isZsir(c)); return o.length ? { type: "play", card: pick(o) } : null; } return null;
    case "hold":
      if (L.kind === "continue") return !ours && takes.length ? { type: "play", card: takes.find((c) => c.rank !== "VII") || takes[0] } : null;
      if (L.kind === "respond" && !ours && takes.length) return { type: "play", card: takes.find((c) => c.rank !== "VII") || takes[0] };
      return null;
    case "nohold":
      if (L.kind === "continue") return { type: "pass" };
      if (L.kind === "respond") { const o = plays.filter((c) => !claims(t.stack, c, seat) && !isZsir(c)); return o.length ? { type: "play", card: pick(o) } : null; }
      return null;
  }
  return null;
}

function baseChoice(m, seat) {
  const L = legal(m), t = m.trick, hand = m.hands[seat];
  const plays = L.actions.filter((a) => a.type === "play").map((a) => a.card);
  const isVII = (c) => c.rank === "VII";
  const cheapest = (cs) => cs.slice().sort((x, y) => (isZsir(x) - isZsir(y)) || (isVII(x) - isVII(y)) || (m.value(x) - m.value(y)))[0];
  const shed = () => cheapest(plays.filter((c) => !isZsir(c) && !isVII(c) && !claims(t.stack, c, seat)))
                  || cheapest(plays.filter((c) => !isZsir(c) && !isVII(c))) || cheapest(plays.filter((c) => !isZsir(c))) || cheapest(plays);
  if (L.kind === "lead") {                               // lead a rank we hold twice (we can defend it), else a cheap card
    const pair = plays.find((c) => !isZsir(c) && !isVII(c) && hand.some((d) => d !== c && d.rank === c.rank));
    return { type: "play", card: pair || cheapest(plays.filter((c) => !isVII(c))) || cheapest(plays) };
  }
  // an empty trick mid-way (a Fox that pilfered itself, D-491 (6)) has no claim yet
  const cl = claimOf(t.stack), ours = !!cl && cl.team === team(seat);
  const points = t.stack.filter((x) => isZsir(x.card) && x.card.origin === "enc").length * 10;
  const want = m.wanted || ((c) => c.rank === "IX");
  const cargoWorth = team(seat) === 0 ? t.stack.filter((x) => x.card.origin === "enc" && want(x.card)).length * 5 : 0;
  const worth = points + cargoWorth;
  const lastChance = m.finalTrick || m.tricksDone >= m.trickLimit - 1;   // cards still in hand after this trick are wasted
  const natural = plays.filter((c) => claims(t.stack, c, seat) && !isVII(c)), sevens = plays.filter((c) => claims(t.stack, c, seat) && isVII(c));
  // take it back from the other side? a natural card for anything worth having; a Seven only for points (or the last trick)
  const retake = () => (worth > 0 && natural.length) ? natural[0]
                     : (sevens.length && (points > 0 || (lastChance && worth > 0))) ? sevens[0] : null;
  if (L.kind === "continue") {
    const c = !ours && retake();
    return c ? { type: "play", card: c } : { type: "pass" };   // concede a dry trick; never prolong one we hold
  }
  if (!ours) { const c = retake(); return { type: "play", card: c || shed() }; }
  // our side holds it: add lard (an X or Ász) when the other side is unlikely to retake the trick (kenés)
  const z = plays.filter(isZsir);
  if (z.length && (lastChance || retakeRisk(m, seat) < AI.greaseRisk || m.tricksDone >= m.trickLimit - AI.greaseLateTricks)) return { type: "play", card: z[0] };
  return { type: "play", card: shed() };
}

// AI tuning (not rules): how much retake risk it accepts when adding lard, and from how many tricks before the end it adds
// lard regardless (cards left in hand at the end are wasted)
export const AI = { greaseRisk: 2, greaseLateTricks: 1 };   // tuned on 1,500 AI matches: points played 16 -> 30 of 80, sides even

// How many cards that could retake this trick the other side is expected to hold, from public information only: every
// location deck holds each rank once per suit, every personal deck once (D-406, D-450); subtract what has been played and
// what this player holds, and share the rest by hand sizes. A traditional card-counting estimate, not a rule.
function retakeRisk(m, seat) {
  const t = m.trick, bottom = t.stack[0]?.card.rank;
  const decks = 4 + m.personal.filter(Boolean).length;                   // copies of each rank in play: 4 suits + personal decks
  const seen = (r) => m.history.flatMap((h) => h.stack).concat(t.stack).filter((x) => x.card.rank === r).length + m.hands[seat].filter((c) => c.rank === r).length;
  const threats = Math.max(0, decks - seen(bottom)) + (bottom === "VII" ? 0 : Math.max(0, decks - seen("VII")));
  const unseen = Math.max(1, m.deck.length + [0, 1, 2, 3].filter((s) => s !== seat).reduce((a, s) => a + m.hands[s].length, 0)
                            + m.personal.filter(Boolean).reduce((a, p) => a + p.length, 0));
  // the opponents who still play after us this round, and the caller's continuation if the caller is an opponent
  let s = nextSeat(seat), oppCards = 0;
  while (s !== t.caller) { if (team(s) !== team(seat)) oppCards += m.hands[s].length; s = nextSeat(s); }
  if (team(t.caller) !== team(seat)) oppCards += m.hands[t.caller].length;
  return threats * oppCards / unseen;
}

// ---------------------------------------------------------------- a location match (D-149, D-153, D-391, D-406, D-450)
/** The location's encounter deck is its four suits' complete sets, 32 cards (D-391, D-406). The two NPC opponents each
 *  bring a full-rank personal deck of a suit of the location (D-450; Region 1: unupgraded). The companion plays from the
 *  player's personal deck (D-153). */
export function locationMatch({ rng, suits, playerPersonal, value, trickLimit, names, onPlay, onTrick, deckCard, partner, opponents, wanted, seats, companion, extra = [] }) {
  const deck = extra.map((x) => card(x.rank, x.suit, x)).concat(suits.flatMap((suit) => ZSIR_RANKS.map((rank) => { const x = deckCard ? deckCard(rank, suit) : {}; return card(rank, suit, x.refined || x.adjective || !DECK_UP ? x : { ...x, ...DECK_UP(rank, suit, x) }); })));
  // opponents: given (a POI's NPCs after negotiation) or two locals of the location's suits; a POI partner brings its own deck
  const npcSuits = opponents || [rng.pick(suits), rng.pick(suits)];
  const npcDeck = (suit) => ZSIR_RANKS.map((rank) => npcCard(rank, suit));
  // a match shared with other caravans (D-408, D-425, D-914): seats 1-3 given (a caravan's own personal deck or an NPC local);
  // each seat keeps what it captures
  if (seats) {
    const deckOf = (sv) => (sv.deck ? drawable(sv.deck).map((c) => card(c.rank, c.suit, { ...c, ref: c })) : npcDeck(sv.suit));
    const m = newMatch({ rng, encounterDeck: deck, value, trickLimit, onPlay, onTrick, wanted, suits,
      personal: [drawable(playerPersonal).map((c) => card(c.rank, c.suit, { ...c, ref: c })), deckOf(seats[1]), deckOf(seats[2]), deckOf(seats[3])],
      names: ["You", seats[1].name, seats[2].name, seats[3].name] });
    m.shared = seats; m.capturedBySeat = [[], [], [], []];
    return m;
  }
  return newMatch({ rng, encounterDeck: deck, value, trickLimit, onPlay, onTrick, wanted, suits,
    personal: [drawable(playerPersonal).map((c) => card(c.rank, c.suit, { ...c, ref: c })), npcDeck(npcSuits[0]), partner ? npcDeck(partner) : companion ? mercCards(companion.deck) : null, npcDeck(npcSuits[1])],
    names: names || ["You", `Rival A (${npcSuits[0]})`, partner ? `Partner (${partner})` : companion ? companion.name : "Companion", `Rival B (${npcSuits[1]})`] });
}

// ---------------------------------------------------------------- the checkpoint encounter (D-139 to D-141, D-158, D-450)
/** Player + companion against two King's Men, each with its own full-rank King's Men deck (D-450; Region 1 unupgraded).
 *  The shared deck is the caravan's actual cargo (D-170); personal cards are NOT transient here (D-140). */
export function checkpointMatch({ rng, cargo, playerPersonal, value, trickLimit, onPlay, onTrick, suits, companion }) {
  const km = () => ZSIR_RANKS.map((rank) => npcCard(rank, "King's Men"));
  return newMatch({ rng, value, trickLimit, onPlay, onTrick, kind: "checkpoint", suits: suits && suits.length ? suits : null,   // D-379, D-399
    encounterDeck: cargo.map((c) => card(c.rank, c.suit, { ...c, ref: c })),
    personal: [drawable(playerPersonal).map((c) => card(c.rank, c.suit, { ...c, ref: c })), km(), companion ? mercCards(companion.deck) : null, km()],
    names: ["You", "King's Man A", companion ? companion.name : "Companion", "King's Man B"] });
}

/** Who ends up with what after a checkpoint encounter (D-140, D-141, D-169, D-219). Cards that never entered a trick
 *  stay where they came from. Returns the played cards by fate. */
export function checkpointOutcome(m) {
  const out = { cargoKept: [], cargoLost: [], personalToCargo: [], personalLost: [], kingsMenTaken: [] };
  for (const tr of m.history) for (const { card: c, seat, resurrect } of tr.stack) {
    if (resurrect || c.echo || c.mercDeck || c.merc) continue;   // a mercenary card is never captured or lost when played (D-337)      // back to its origin deck / a transient copy / a mercenary's own deck (D-157)
    const ours = tr.team === 0;
    if (c.origin === "enc") (ours ? out.cargoKept : out.cargoLost).push(c);
    else if (tr.team < 0) continue;                       // a Tusker's trick: personal cards are transient, nobody takes them (D-211)
    else if (seat === 0 || seat === 2) (ours ? out.personalToCargo : out.personalLost).push(c);
    else if (ours) out.kingsMenTaken.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- the cargo ambush (D-174 to D-227, D-800)
/** deck: the exposed cargo of both sides plus top-up cards, each tagged own: "player" | "opp" | "gen" and ref to the original.
 *  The ambusher (seats 1 and 3) leads, random between its two participants (D-176, D-213). The opponents bring full-rank
 *  personal decks of their faction (D-450; Region 1 unupgraded). Personal cards are transient (D-185). */
export function ambushMatch({ rng, deck, playerPersonal, faction, value, trickLimit, onPlay, onTrick, names, leaderSide = 1, wanted, opponentPersonal, companion, learnSuit, opponentCompanion }) {
  const fd = () => ZSIR_RANKS.map((rank) => npcCard(rank, faction));
  const m = newMatch({ rng, value, trickLimit, onPlay, onTrick, wanted, kind: "ambush", twoTricksOnSixteen: true, learnSuit: learnSuit || faction,
    leader: (rng.next() < 0.5 ? 0 : 2) + leaderSide,
    encounterDeck: deck,
    personal: [drawable(playerPersonal).map((c) => card(c.rank, c.suit, { ...c, ref: c })), opponentPersonal ? drawable(opponentPersonal).map((c) => card(c.rank, c.suit, { ...c, ref: c })) : fd(), companion ? mercCards(companion.deck) : null, opponentCompanion ? mercCards(opponentCompanion.deck) : opponentPersonal ? null : fd()],   // a rival's own mercenary plays seat 3 (D-1188; D-1231)
    names: names || ["You", `${faction} A`, companion ? companion.name : "Companion", `${faction} B`] });
  if (companion && names) m.names[2] = companion.name;
  return m;
}

// a deployed mercenary's own deck (D-157): personal-origin, transient, never captured into cargo
const mercCards = (deck) => deck.map((c) => card(c.rank, c.suit, { ...c, mercDeck: true }));
// confrontation points (D-197), which decide a duel: not cargo values
export const CONFRONTATION = { VII: 7, VIII: 1, IX: 2, X: 3, "Alsó": 4, "Felső": 5, "Király": 6, "Ász": 8 };
/** a duel between two caravans (D-186, D-283): personal cards only, each side's personal deck in place of the encounter deck
 *  (four-card hands, the personal slots empty), every card transient; at most two completed tricks; first lead random */
export function duelMatch({ rng, playerPersonal, opponentPersonal, names, onPlay, onTrick, value, companion, learnSuit, opponentCompanion }) {
  const mix = (a) => shuffle(rng, drawable(a).map((c) => card(c.rank, c.suit, { ...c, ref: c, origin: "pers" })));
  const mine = mix(playerPersonal), theirs = mix(opponentPersonal), merc = companion ? mix(companion.deck) : null;
  const merc2 = opponentCompanion ? mix(opponentCompanion.deck) : null;   // the other side's deployed mercenary plays seat 3 (D-186, D-1188; D-1231)
  const hands = [mine.splice(-4), theirs.splice(-4), (merc || mine).splice(-4), (merc2 || theirs).splice(-4)];
  const m = newMatch({ rng, value, trickLimit: 2, onPlay, onTrick, kind: "duel", encounterDeck: [], personal: [[], [], null, []], hands, names, learnSuit });
  m.hands = m.hands.map((h, s) => h.map((c) => ({ ...c, origin: "pers", ownerSeat: s })));   // personal and transient (D-186)
  m.personal = [mine, theirs, merc, merc2 || theirs];               // replenishment from each side's own deck (seat 3 shares seat 1's; a mercenary its own)
  m.finalTrick = false;
  return m;
}
/** the duel's result from the confrontation points each team captured (D-186, D-197): "win" | "lose" | "draw" for your side */
export function duelOutcome(m) {
  const pts = [0, 0];
  for (const tr of m.history) for (const { card: c } of tr.stack) if (tr.team >= 0) pts[tr.team] += CONFRONTATION[c.rank] || 0;
  return { pts, result: pts[0] > pts[1] ? "win" : pts[0] < pts[1] ? "lose" : "draw" };
}

/** after an ambush: only cards played into a trick and captured change owner (D-175); unplayed exposed cards go home;
 *  uncaptured generated cards disappear (D-253) */
export function ambushOutcome(m) {
  const out = { kept: [], lost: [], won: [] };          // kept: yours recovered; lost: yours taken; won: theirs or generated taken by you
  for (const tr of m.history) for (const { card: c, resurrect } of tr.stack) {
    if (c.origin !== "enc" || resurrect) continue;
    if (c.own === "player") (tr.team === 0 ? out.kept : out.lost).push(c);
    else if (tr.team === 0) out.won.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- partner commands (D-152, D-409)
/** Four requests between partners: requests, not orders; the receiver may follow or ignore. Free to give at any time
 *  during play; one standing request, replaced by the next, cleared at the end of the trick. */
export const COMMANDS = { add: "Add lard!", noadd: "Don't add lard!", hold: "Hold!", nohold: "Don't hold!" };
export function command(m, type, seat = 0) {   // either side calls to its own partner (D-409: between partners; D-1232)
  if (m.ended || !COMMANDS[type]) return;
  if (seat % 2 === 0) m.command = type; else m.command1 = type;
  say(m, `${seat === 0 ? "You call" : `${m.names[seat]} calls`} to ${seat === 0 ? "your" : "their"} partner: ${COMMANDS[type]}`);
}

// ---------------------------------------------------------------- friendly roadside match (D-795, D-797, D-881)
/** The player's personal deck replaces the encounter deck, split between player and companion; the opponents a one-faction
 *  deck of the same size; personal slots stay empty (D-283); at most 2 completed tricks (D-881); Zsír points decide. */
export function friendlyMatch({ rng, playerPersonal, faction, value, names, companion }) {
  const mine = shuffle(rng, drawable(playerPersonal).map((c) => card(c.rank, c.suit, { ...c, ref: c })));
  const theirs = [];
  while (theirs.length < mine.length) theirs.push(...ZSIR_RANKS.map((rank) => npcCard(rank, faction)));   // duplicates if needed (D-797)
  const t2 = shuffle(rng, theirs.slice(0, mine.length)), half = Math.ceil(mine.length / 2), half2 = Math.ceil(t2.length / 2);
  const merc = companion ? shuffle(rng, mercCards(companion.deck)) : null;
  return newMatch({ rng, value, trickLimit: 2, kind: "friendly", encounterDeck: [], personal: [],
    hands: [mine.slice(0, half), t2.slice(0, half2), merc ? merc.slice(0, mine.length - half) : mine.slice(half), t2.slice(half2)],
    names: names || ["You", `${faction} A`, companion ? companion.name : "Companion", `${faction} B`] });
}

export { say as matchSay };
