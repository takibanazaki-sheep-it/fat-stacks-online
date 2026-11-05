// The Zsír match view. Shows the engine's state and collects the human's decisions; the rules live in sim/zsir.js.
import { legal, act, aiChoose, claimOf, claims, score, isZsir, command, COMMANDS, ATTRITION } from "../sim/zsir.js";
import { FARMFOLK_IX, unbuiltAbilities } from "../sim/abilities.js";

const SUIT = {          // D-411 English names; colours echo the Hungarian pattern (acorn, heart, leaf, bell)
  Farmfolk: { cls: "s-farm", mark: "◆" }, Clergy: { cls: "s-clergy", mark: "♥" },
  Forestfolk: { cls: "s-forest", mark: "♣" }, Tradesfolk: { cls: "s-trade", mark: "●" },
  Plainsfolk: { cls: "s-plains", mark: "▲" }, Townsfolk: { cls: "s-towns", mark: "■" }, Carnivalfolk: { cls: "s-carnival", mark: "✦" },
  Beasts: { cls: "s-beasts", mark: "✶" }, Bandits: { cls: "s-bandits", mark: "✕" }, "King's Men": { cls: "s-kings", mark: "♔" },
  Hillfolk: { cls: "s-hill", mark: "⛰" }, Fisherfolk: { cls: "s-fisher", mark: "≈" },
};
const SHORT = { VII: "VII", VIII: "VIII", IX: "IX", X: "X", "Alsó": "Alsó", "Felső": "Felső", "Király": "Király", "Ász": "Ász" };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export function cardEl(c, opts = {}) {
  const s = SUIT[c.suit] || { cls: "s-other", mark: "■" };
  const e = el("div", `zc ${s.cls}${isZsir(c) ? " zsir" : ""}${opts.cls ? " " + opts.cls : ""}`);
  e.innerHTML = `<span class="r">${SHORT[c.rank] || c.rank}</span><span class="m">${s.mark}</span><span class="su">${c.suit}</span>`
    + (isZsir(c) ? `<span class="pt">10</span>` : "") + (c.origin === "pers" ? `<span class="tag">personal</span>` : "")
    + (c.own === "player" ? `<span class="tag mine">your cargo</span>` : c.own === "opp" ? `<span class="tag theirs">their cargo</span>` : c.own === "gen" ? `<span class="tag">local</span>` : "")
    + (c.note ? `<span class="up" title="${c.note}">★</span>` : "")
    + (c.attrition ? `<span class="attr" title="Attrition: ${ATTRITION[c.rank]}">↻</span>` : "")
    + (unbuiltAbilities(c).length ? `<span class="unbuilt" title="Not yet working in this build: ${unbuiltAbilities(c).join("; ")}">⚠</span>` : "");
  return e;
}

/** mount a match: humans = seats the person decides for; onEnd(m) when it's over */
// remote (online, D-957): your plays go to the host instead of straight into the match, and the AI seats are moved by the host's
// accepted moves (sim/multi.js settle); refresh() redraws when they arrive
export function mountMatch(root, m, { humans = [0], onEnd, title = "Zsír", subtitle = "", pace = 450, remote = null } = {}) {
  root.innerHTML = "";
  // keyboard play: 1-6 play that card of your hand (each card shows its number), P passes, Enter continues once it's over
  let keyActs = { cards: [], pass: null, go: null };
  if (root._keys) removeEventListener("keydown", root._keys);
  root._keys = (e) => {
    if (root.hidden || e.target.closest?.("input, textarea")) return;
    const k = Number(e.key);
    if (k >= 1 && k <= 9 && keyActs.cards[k - 1]) { e.preventDefault(); keyActs.cards[k - 1](); }
    else if ((e.key === "p" || e.key === "P") && keyActs.pass) { e.preventDefault(); keyActs.pass(); }
    else if (e.key === "Enter" && keyActs.go) { e.preventDefault(); keyActs.go(); }
  };
  addEventListener("keydown", root._keys);
  const wrap = el("div", "zm");
  wrap.innerHTML = `
    <div class="zm-head"><b>${title}</b> <span class="muted">${subtitle}</span></div>
    <div class="zm-body">
      <div class="zm-main">
        <div class="zm-table">
          <div class="seat seat-2"></div><div class="seat seat-1"></div><div class="seat seat-3"></div>
          <div class="zm-center"><div class="zm-target"></div><div class="zm-stack"></div><div class="zm-claim"></div></div>
          <div class="seat seat-0"></div>
        </div>
        <div class="zm-risk"></div>
        <div class="zm-prompt"></div>
        <div class="zm-hand"></div>
        <div class="zm-calls"></div>
      </div>
      <aside class="zm-side">
        <div class="zm-score"></div>
        <div class="zm-caps"></div>
        <div class="zm-last"></div>
        <div class="zm-logwrap"><div class="zm-sh">What happened</div><div class="zm-log"></div></div>
      </aside>
    </div>`;
  root.append(wrap);
  const q = (s) => wrap.querySelector(s);
  let busy = false, timer = null;

  function seatBox(s) {
    const box = q(`.seat-${s}`); const L = legal(m);
    const n = m.hands[s].length, tm = s % 2 === 0 ? "ours" : "theirs";
    const isCaller = m.trick && m.trick.caller === s, isTurn = L.seat === s;
    box.className = `seat seat-${s} ${tm}${isTurn ? " turn" : ""}`;
    box.innerHTML = `<div class="who">${m.names[s]}${isCaller ? ' <span class="badge">caller</span>' : ""}</div>`
      + (s === 0 ? "" : `<div class="backs">${"<i></i>".repeat(n)}</div><div class="muted">${n} card${n === 1 ? "" : "s"}</div>`);
  }

  function render() {
    keyActs.pass = null; keyActs.go = null;
    const L = legal(m), t = m.trick;
    const a = score(m, 0), b = score(m, 1);
    sidePanel(a, b);
    [0, 1, 2, 3].forEach(seatBox);
    const stack = q(".zm-stack"); stack.innerHTML = "";
    const shown = t ? t.stack : [];
    // Lost in the Woods (D-247, D-277): the card to match and the claimant are hidden from everyone until the claim changes
    const lost = !!(t && t.lost);
    const cl = t && t.stack.length && !lost ? claimOf(t.stack) : null;
    (shown || []).forEach((x, i) => {
      const ce = cardEl(x.disguise?.hidden ? { rank: x.disguise.rank, suit: x.disguise.suit } : lost && i === 0 ? { rank: "?", suit: "under the net" } : x.card, { cls: `${i === 0 && !lost ? "bottom" : ""}${cl && cl.index === i ? " claim " + (cl.team === 0 ? "ours" : "theirs") : ""}${x.horizontal ? " sideways" : ""}` });
      ce.title = `${m.names[x.seat]}`; const w = el("div", "played"); w.append(ce, el("div", "by", m.names[x.seat])); stack.append(w);
    });
    q(".zm-target").innerHTML = lost ? "Lost in the Woods: under the camouflage net, nobody can make out what to match or who holds the trick."
      : t && t.stack.length
      ? `To take this trick: play <b>${t.stack[0].card.rank}</b>${t.stack[0].card.rank === "VII" ? "" : " or any <b>VII</b>"}`
      : m.ended ? "" : `${t.caller === 0 ? "You lead" : `${m.names[t.caller]} leads`}. The first card sets the rank to match.`;
    q(".zm-claim").innerHTML = cl ? `Held by <b class="${cl.team === 0 ? "ours" : "theirs"}">${m.names[cl.seat]}</b> (${cl.reason}) · ` + stakes(t.stack) : "";

    // prompt and hand
    const hand = q(".zm-hand"); hand.innerHTML = "";
    const mine = humans.includes(L.seat);
    const prompt = q(".zm-prompt");
    if (m.ended) {
      prompt.className = "zm-prompt end " + m.result;
      prompt.innerHTML = m.kind === "ambush"
        ? `<b>The ambush is over.</b> Only cards captured in tricks change hands; the result is decided by final cargo value, shown next.`
        : m.kind === "checkpoint"
        ? `<b>The encounter is over.</b> Points ${a.points}–${b.points} don't decide anything here: what matters is how much cargo you kept (D-141). Your team took ${m.captured[0].length} of the cargo cards played.`
        : m.kind === "duel" ? `<b>${m.result === "win" ? "You win the duel" : m.result === "lose" ? "You lose the duel" : "A friendly handshake"}</b> — ${m.duelPts[0]}–${m.duelPts[1]} in confrontation points`
        : `<b>${m.result === "win" ? "Your team wins" : m.result === "lose" ? "Your team loses" : "A draw"}</b> — ${a.points}–${b.points} points`
        + (a.points === b.points ? ` (tie broken by captured value ${a.value}–${b.value})` : "")
        + (m.kind === "friendly" ? `. A friendly game: ${m.result === "win" ? "your prize follows" : "no prize, and nothing lost"}.` : (m.capturedBySeat ? `. You captured ${m.capturedBySeat[0].length} encounter card${m.capturedBySeat[0].length === 1 ? "" : "s"} yourself (each seat keeps its own).` : `. Your team captured ${m.captured[0].length} encounter card${m.captured[0].length === 1 ? "" : "s"}.`));
      const cap = el("div", "zm-captured"); (m.capturedBySeat ? m.capturedBySeat[0] : m.captured[0]).forEach((c) => cap.append(cardEl(c, { cls: "small" })));
      prompt.append(cap);
      if (onEnd) { const go = el("button", "primary", "Continue (Enter)"); go.onclick = () => { removeEventListener("keydown", root._keys); onEnd(m); }; keyActs.go = go.onclick; prompt.append(go); }
    } else if (mine) {
      prompt.className = "zm-prompt yours";
      prompt.innerHTML = L.kind === "penalty" ? `<b>Attrition!</b> ${L.pending.kind === "draw" ? `Draw ${L.pending.count} and lose your turn` : L.pending.kind === "skip" ? "You lose your turn" : "You have no card that meets the request: draw one and lose your turn"}${L.actions.some((x) => x.type === "play") ? ", or answer with a highlighted Attrition card" : ""}.`
        : L.kind === "extra" ? "<b>Double Play:</b> play one more card now."
        : L.pending ? `<b>Attrition request:</b> you must play ${L.pending.kind === "rank" ? `a ${L.pending.value}` : L.pending.kind === "suit" ? `a ${L.pending.value} card` : "a face card (Alsó, Felső, Király, Ász)"}. Only those cards are playable.`
        : L.kind === "lead" ? "<b>Your lead.</b> Play any card; its rank is what the others must match."
        : L.kind === "respond" ? `<b>Your turn.</b> You must play a card. ${t.stack.length && !t.lost ? `${/^[AÁE]/.test(t.stack[0].card.rank) ? "An" : "A"} ${t.stack[0].card.rank}${t.stack[0].card.rank === "VII" ? "" : " or a VII"} takes the claim.` : ""}`
        : `<b>The round is back to you.</b> Continue with a card that takes the claim, or pass and end the trick.`;
      const pen = L.actions.find((x) => x.type === "penalty");
      if (pen) { const b = el("button", "pass", pen.draw ? `Draw ${pen.draw} and lose the turn` : "Lose the turn"); b.onclick = () => play(L.seat, { type: "penalty" }); prompt.append(b); }
      if (L.kind === "continue") { const p = el("button", "pass", `Pass (P) — the trick goes to ${claimOf(t.stack).team === 0 ? "your team" : "the rivals"}`); p.onclick = () => play(L.seat, { type: "pass" }); keyActs.pass = p.onclick; prompt.append(p); }
    } else {
      prompt.className = "zm-prompt";
      prompt.innerHTML = `<span class="muted">${L.seat === 0 ? "You are" : `${m.names[L.seat]} is`} thinking…</span>`;
    }
    // partner commands (D-409): requests to your partner, any time during play; they last until the trick ends
    const calls = q(".zm-calls"); calls.innerHTML = "";
    if (!m.ended && humans.includes(0)) {
      calls.append(el("span", "muted", "Call to your partner: "));
      for (const [k, txt] of Object.entries(COMMANDS)) {
        const b = el("button", `call${m.command === k ? " on" : ""}`, txt);
        b.title = { add: "Ask your partner to throw an X or Ász onto a trick your side holds", noadd: "Ask your partner to keep their X and Ász back",
                    hold: "Ask your partner to take the trick if they can", nohold: "Ask your partner not to fight for this trick" }[k];
        b.onclick = () => { command(m, k); render(); }; calls.append(b);
      }
    }
    // at a checkpoint your personal cards are at stake (D-140, D-867): say so, and flag Farmer's Papers
    const risk = q(".zm-risk");
    if (m.kind === "checkpoint" && !m.ended) {
      const fp = [...m.hands[0], ...m.personal[0]].some((c) => c.origin === "pers" && FARMFOLK_IX.expandedCarryingCapacity(c));
      risk.innerHTML = `⚠ <b>Personal cards are at risk here.</b> Any you or your companion play can be lost to the King's Men, or become cargo if your team takes the trick.`
        + (fp ? ` <b>Farmer's Papers</b> gives your 40 capacity only while in your personal deck: if it is played, capacity drops to 32 either way.` : "");
    } else risk.innerHTML = "";
    const legalIds = new Set(L.actions.filter((x) => x.type === "play").map((x) => x.card.id));
    keyActs.cards = [];
    m.hands[0].slice().sort((x, y) => (x.origin > y.origin) - (x.origin < y.origin)).forEach((c, idx) => {
      const ok = mine && L.seat === 0 && legalIds.has(c.id);
      const would = !c.jesterGuise && t && t.stack.length && claims(t.stack, c);   // Fool's Gold hides even that
      const atRisk = m.kind === "checkpoint" && c.origin === "pers";
      const ce = cardEl(c.jesterGuise ? { rank: "Ász", suit: "Carnivalfolk", origin: c.origin } : c, { cls: `${c.jesterGuise ? "guise " : ""}${ok ? "playable" : "idle"}${ok && would ? " wins" : ""}${atRisk ? " atrisk" : ""}` });
      if (atRisk) ce.title = FARMFOLK_IX.expandedCarryingCapacity(c) ? "At risk: playing Farmer's Papers loses its 40 capacity whoever takes the trick" : "At risk: can be lost to the King's Men";
      const la = ok && L.actions.find((x) => x.type === "play" && x.card.id === c.id);
      if (ok) ce.onclick = () => la.mustHorizontal ? play(0, { type: "play", card: c, horizontal: true }) : c.attrition ? chooseOrientation(c) : play(0, { type: "play", card: c });
      if (idx < 9) { const kb = document.createElement("span"); kb.className = "kbd"; kb.textContent = String(idx + 1); ce.append(kb); }
      keyActs.cards[idx] = ok ? ce.onclick : null;
      hand.append(ce);
    });
    if (!remote && !m.ended && !mine && !busy) { busy = true; timer = setTimeout(() => { busy = false; if (m.ended || legal(m).seat !== L.seat) return render(); play(L.seat, aiChoose(m, L.seat)); }, pace); }
  }

  // what the trick on the table is worth: at a checkpoint, your own cards are at stake (D-140)
  function stakes(stack) {
    if (m.kind === "checkpoint") {
      const cargo = stack.filter((x) => x.card.origin === "enc").length, pers = stack.filter((x) => x.card.origin === "pers" && x.seat % 2 === 0).length,
            km = stack.filter((x) => x.card.origin === "pers" && x.seat % 2 === 1).length;
      return `at stake: ${cargo} of your cargo${pers ? `, ${pers} of your personal cards` : ""}${km ? `, ${km} King's Men card${km === 1 ? "" : "s"}` : ""}`;
    }
    if (m.kind === "ambush") {
      const mine = stack.filter((x) => x.card.own === "player").length, theirs = stack.filter((x) => x.card.own === "opp").length, gen = stack.filter((x) => x.card.own === "gen").length;
      return `at stake: ${mine} of your cargo, ${theirs} of theirs${gen ? `, ${gen} local` : ""}`;
    }
    return `on the table: ${stack.filter((x) => x.card.origin === "enc").length} spoils, ${stack.filter((x) => isZsir(x.card) && x.card.origin === "enc").length * 10} points`;
  }
  root.__autoplay = () => { humans.length = 0; render(); };   // testing hook

  // D-101: a card with Attrition can be played normally or sideways (its rank's Attrition effect); requests need a choice
  function chooseOrientation(c) {
    const box = q(".zm-prompt"); box.innerHTML = "";
    box.append(el("div", "", `<b>${c.rank} of ${c.suit}</b>: play it normally, or sideways for Attrition: <i>${ATTRITION[c.rank]}</i>.`));
    const row = el("div", "orient");
    const normal = el("button", "", "Play normally"); normal.onclick = () => play(0, { type: "play", card: c }); row.append(normal);
    if (c.rank === "IX" || c.rank === "Felső") {
      const opts = c.rank === "IX" ? ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"] : [...new Set(m.deck.concat(m.hands.flat()).map((x) => x.suit))];
      for (const o of opts) { const b = el("button", "side", `Sideways: ask for ${o}`); b.onclick = () => play(0, { type: "play", card: c, horizontal: true, request: o }); row.append(b); }
    } else { const b = el("button", "side", "Play sideways (Attrition)"); b.onclick = () => play(0, { type: "play", card: c, horizontal: true }); row.append(b); }
    const back = el("button", "", "Cancel"); back.onclick = () => render(); row.append(back);
    box.append(row);
  }

  // the side panel: score, what each side has captured, the last trick, the live log
  function sidePanel(a, b) {
    const them = m.kind === "checkpoint" ? "King's Men" : m.kind === "ambush" ? "Attackers" : "Rivals";
    q(".zm-score").innerHTML = `<div class="zm-sh">Score</div><div class="scoreline"><span class="ours">Your side <b>${a.points}</b></span><span class="theirs">${them} <b>${b.points}</b></span></div>`
      + `<div class="muted">Trick ${Math.min(m.tricksDone + (m.ended ? 0 : 1), m.trickLimit)} of ${m.trickLimit}${m.finalTrick && !m.ended ? " · final trick (deck empty)" : ""} · deck ${m.deck.length}</div>`
      + `<div class="muted">X and Ász score 10 each${m.kind === "location" || m.kind === "friendly" ? "; ties go to the higher captured value" : m.kind === "checkpoint" ? "; points don't decide survival here" : "; cargo value decides an ambush"}.</div>`;
    const caps = q(".zm-caps"); caps.innerHTML = `<div class="zm-sh">Your side's captures (${m.captured[0].length})</div>`;
    const row = el("div", "minirow"); m.captured[0].forEach((c) => row.append(cardEl(c, { cls: "mini" }))); caps.append(row);
    caps.append(el("div", "muted", `${them} captured ${m.captured[1].length}${m.captured[1].some(isZsir) ? `, including ${m.captured[1].filter(isZsir).length} X/Ász` : ""}.`));
    const last = q(".zm-last"); last.innerHTML = "";
    if (m.lastTrick) {
      const tr = m.lastTrick; last.append(el("div", "zm-sh", tr.team < 0 ? "Last trick: lost to the Tusker" : `Last trick: ${tr.team === 0 ? "yours" : them.toLowerCase()} (${m.names[tr.winner]})`));
      const r = el("div", "minirow"); tr.stack.forEach((x) => r.append(cardEl(x.disguise?.hidden ? { rank: x.disguise.rank, suit: x.disguise.suit } : x.card, { cls: `mini${x.horizontal ? " sideways" : ""}` }))); last.append(r);
    }
    const log = q(".zm-log"); log.innerHTML = m.log.slice(-14).map((x) => `<div>${x}</div>`).join(""); log.scrollTop = 1e9;
  }

  function play(seat, action) {
    if (remote) { busy = true; q(".zm-prompt").innerHTML = "<span class=\"muted\">Sent…</span>"; return remote(seat, action); }
    const before = m.tricksDone;
    act(m, seat, action);
    if (m.tricksDone > before) {          // pause on the finished trick so the result can be read
      const tr = m.lastTrick; busy = true;
      showFinished(tr);
      timer = setTimeout(() => { busy = false; render(); }, Math.max(pace * 3, 1300));
    } else render();
  }
  function showFinished(tr) {
    const stack = q(".zm-stack"); stack.innerHTML = "";
    tr.stack.forEach((x, i) => { const w = el("div", "played"); w.append(cardEl(x.card, { cls: `${i === 0 ? "bottom" : ""} ${claimOf(tr.stack).index === i ? "claim " + (tr.team === 0 ? "ours" : "theirs") : "fade"}` }), el("div", "by", m.names[x.seat])); stack.append(w); });
    const enc = tr.stack.filter((x) => x.card.origin === "enc"), pts = enc.filter((x) => isZsir(x.card)).length * 10;
    q(".zm-claim").innerHTML = `<b class="${tr.team === 0 ? "ours" : "theirs"}">${tr.team < 0 ? "The Tusker wins: the trick is lost to everyone" : tr.team === 0 ? "Your team takes the trick" : m.kind === "checkpoint" ? "The King's Men take the trick" : "The rivals take the trick"}</b> (${m.names[tr.winner]}) · `
      + (m.kind === "checkpoint" || m.kind === "ambush" ? (tr.team === 0 ? "your side keeps these cards" : "these cards are lost to you") : `${enc.length} spoils${pts ? `, ${pts} points` : ""}`);
    q(".zm-target").innerHTML = ""; q(".zm-prompt").innerHTML = ""; q(".zm-hand").querySelectorAll(".zc").forEach((e) => { e.className += " idle"; e.onclick = null; });
    const a = score(m, 0), b = score(m, 1);
    sidePanel(a, b);
  }
  render();
  let shownTricks = m.tricksDone;
  const refresh = () => {                       // online: the host's moves have arrived; show any trick they finished
    if (!remote) return;
    clearTimeout(timer); busy = false;
    if (m.tricksDone > shownTricks) { shownTricks = m.tricksDone; busy = true; showFinished(m.lastTrick); timer = setTimeout(() => { busy = false; render(); }, Math.max(pace * 3, 1300)); }
    else render();
  };
  return { stop: () => clearTimeout(timer), refresh };
}
