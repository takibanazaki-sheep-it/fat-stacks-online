// Browser interface (D-857): displays the simulation's state and collects decisions; it holds no rules.
import { setWorldMap, runScore, castlePrice } from "../sim/engine.js";
import { newGame, options, act as simAct, describe, defaultPayment, requirementStatus, suspicion, recruitPreview, cardName, military, slots, counted } from "../sim/engine.js";
import { CATALOGUE as ENCOUNTERS } from "../sim/encounters.js";
import { FARMFOLK_IX, unbuiltAbilities } from "../sim/abilities.js";
import { RULES, SZARAZ, PLACEHOLDER } from "../sim/rules.js";
import { mountMatch } from "./match.js";
import { START_CIVS } from "../sim/world.js";
import { loadProfile, saveProfile, awardRun, openHideout, captureBonus } from "./hideout.js";
import { entry as upgradeEntry } from "../sim/upgrades.js";
import { newWorld, worldAct, flushAfter, visibleCaravans, inspectCaravan, richest, meetings, aiChallenges, challenge as challengeSolo, answer as answerSolo, payToll as payTollSolo, trade as tradeSolo, ambushCaravan as ambushSolo, finishDuel as finishDuelSolo, stakeValue, nextRegion } from "../sim/world.js";
import { encodeMove, encodeZ, encodeStake } from "../sim/multi.js";
import { online, hideNet } from "./net.js";
import { cutValue } from "../sim/engine.js";
import { ATTRITION } from "../sim/zsir.js";
// a card's name, marked when it has abilities the game doesn't execute yet (D-871)
const label = (x) => cardName(x) + (x.attrition ? " ↻" : "") + (unbuiltAbilities(x).length ? " ⚠" : "");
const RANKS_UI = ["VII", "VIII", "IX", "X", "Alsó", "Felső", "Király", "Ász"];
let negoTimer = null, negoFor = null;
let mountedMatch = null, recruitSel = null, exposeTimer = null, exposeFor = null, growlsSeen = 0;

const params = new URLSearchParams(location.search);
// online multiplayer (D-955 to D-957): ?mp=host or ?mp=join&code=XXXXX, with &civ and &name; the host's machine builds the world
const MP_MODE = ["host", "join"].includes(params.get("mp")) ? params.get("mp") : null;
// each run's world is generated for it (D-708): ?world=<n> reads the server's cache/, where Region 1 arrives within the 30 s budget
// and later regions follow in the background; ?region=<name> reads a fixed exported map in data/ (tests)
const WORLD_PARAM = params.get("world") && /^\d+$/.test(params.get("world")) ? params.get("world") : null;
const DATA_DIR = WORLD_PARAM ? "cache" : "data";
const REGION = WORLD_PARAM ? `w${WORLD_PARAM}-r1` : (params.get("region") || "w1-r1");
// wait until region n of a generated world is on disk; a screen shows the time taken; a genuine failure is reported (D-710)
async function waitForRegion(n, label) {
  if (!WORLD_PARAM) return null;
  const t0 = Date.now(); let screen = null, meta = null;
  for (;;) {
    try { meta = await (await fetch(`cache/w${WORLD_PARAM}-world.json?t=${Date.now()}`)).json(); } catch { meta = null; }
    // a world plan that fails the playability check is never committed (D-710 (3)): draw another, unseen by the player
    if (meta && meta.failed && /no committable/.test(meta.failed) && n === 1) { showGenScreen("That world didn't pass the playability check; drawing another…"); await startRun(params.get("civ") || "Farmfolk"); return new Promise(() => {}); }
    if (meta && meta.failed) { showGenScreen(`The world couldn't be generated: ${meta.failed}.`, true); throw new Error("world generation failed"); }
    if (meta && meta.ready >= n) { document.getElementById("genScreen")?.remove(); return meta; }
    screen = showGenScreen(`${label} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (Date.now() - t0 > 120000) { showGenScreen("The world is taking far too long to generate.", true); throw new Error("world generation timed out"); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
function showGenScreen(text, failed = false) {
  let el = document.getElementById("genScreen");
  if (!el) { el = document.createElement("div"); el.id = "genScreen"; document.body.append(el); }
  el.innerHTML = ""; const box = document.createElement("div"); box.className = "helpbox"; el.append(box);
  const p = document.createElement("p"); p.textContent = text; box.append(p);
  if (failed) { const b = document.createElement("button"); b.className = "primary"; b.textContent = "Try another world"; b.onclick = () => startRun(params.get("civ") || "Farmfolk"); box.append(b); }
  return el;
}
const SEED = Number(params.get("seed") || 1);
const MODE = params.get("mode") === "playtest" ? "playtest" : "normal";   // the real rule; &mode=playtest keeps the isolated override
const NS = "http://www.w3.org/2000/svg";
const AUTOPLAY = params.get("autoplay") === "1";   // testing: the AI also plays your seat in matches

let board, svg, overlay;
// a region's board and picture; the run swaps them at each border (D-326)
async function loadBoard(name) {
  board = MP ? JSON.parse(MP.net.files[`${name}.json`]) : await (await fetch(`${DATA_DIR}/${name}.json`)).json();
  if (MP) board = MP.net.world().humans[MP.seat].board.region === board.region ? MP.net.world().humans[MP.seat].board : board;   // the world's own copy
  document.getElementById("board").innerHTML = MP ? MP.net.files[board.map.svg] : await (await fetch(`${DATA_DIR}/${board.map.svg}`)).text();
  svg = document.querySelector("#board svg");
  // show the board only: crop the generator's caption and legend (they're for map review, not play)
  const { pad, top, cell } = board.map; svg.setAttribute("viewBox", `${pad - 4} ${top - 24} ${board.W * cell + 8} ${board.H * cell + 48}`);   // room for markers at the edges
  svg.removeAttribute("style"); for (const t of [...svg.querySelectorAll(":scope > text")]) { const y = +t.getAttribute("y"); if (y < top || y > top + board.H * cell) t.remove(); }
  overlay = document.createElementNS(NS, "g"); svg.appendChild(overlay);
  return board;
}
// a run address with no world number (a stale or hand-typed one) gets a fresh world; ?region= stays for the fixed test maps
if (!MP_MODE && params.get("civ") && !WORLD_PARAM && !params.has("region") && !AUTOPLAY) { await startRun(params.get("civ")); await new Promise(() => {}); }
// the public copy of the game (no world generator behind it, D-959): straight to the hideout, where only joining is offered
if (!MP_MODE && !AUTOPLAY && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) { openHideout(h, loadProfile(), (civ, how) => how && goOnline(civ, how)); await new Promise(() => {}); }
// the host's machine: a new world from serve.py, and each region's files once built (sent to the guests by the host)
async function hostGenerate() { const r = await fetch("api/new-world"); if (!r.ok) throw new Error("couldn't reach the world generator: is serve.py running?"); return (await r.json()).world; }
async function hostRegion(w, n) {
  const t0 = Date.now();
  for (;;) {
    let meta = null; try { meta = await (await fetch(`cache/w${w}-world.json?t=${Date.now()}`)).json(); } catch { meta = null; }
    if (meta?.failed) throw new Error(/no committable/.test(meta.failed) ? "that world didn't pass the playability check; start again for another" : meta.failed);
    if (meta && meta.ready >= n) break;
    if (Date.now() - t0 > 120000) throw new Error("the world is taking far too long to generate");
    await new Promise((r) => setTimeout(r, 400));
  }
  const name = `w${w}-r${n}`, json = await (await fetch(`cache/${name}.json`)).text(), b = JSON.parse(json);
  return { [`${name}.json`]: json, [b.map.svg]: await (await fetch(`cache/${b.map.svg}`)).text(), [`w${w}-world.json`]: await (await fetch(`cache/w${w}-world.json?t=${Date.now()}`)).text() };
}
let MP = null;
if (MP_MODE) {
  try { MP = await online({ mode: MP_MODE, code: params.get("code"), civ: params.get("civ") || "Farmfolk", name: params.get("name") || (MP_MODE === "host" ? "Host" : "Guest"), gameMode: MODE, generate: hostGenerate, fetchRegion: hostRegion }); }
  catch (e) { const el = document.getElementById("netScreen") || document.body; el.hidden = false; el.innerHTML = `<div class="helpbox"><h2>Couldn't connect</h2><p class="bad">${e.message}</p><p><a href="./">Back to the hideout</a></p></div>`; await new Promise(() => {}); }
  hideNet();
} else await waitForRegion(1, "Generating a new world: the geography of all eight regions and Region 1 in full…");
await loadBoard(MP ? `w${mpWorldNo()}-r1` : REGION);
function mpWorldNo() { const k = Object.keys(MP.net.files).find((f) => /^w\d+-world\.json$/.test(f)); return k.match(/^w(\d+)/)[1]; }
const WORLD_ID = MP ? `w${mpWorldNo()}` : REGION.split("-")[0];
let WORLDMAP = null;
async function loadWorldMap() { try { WORLDMAP = MP ? JSON.parse(MP.net.files[`${WORLD_ID}-world.json`]) : await (await fetch(`${DATA_DIR}/${WORLD_ID}-world.json?t=${Date.now()}`)).json(); setWorldMap(WORLDMAP); } catch { /* no world layout: no smuggling premium */ } }
await loadWorldMap();
// the world overview (D-436): the eight regions, their borders, the major features and the capital, visible from the start;
// the road so far: regions passed, the current one, the crossings between them (D-452)
const TRAVELLED = {};   // regions entered this run: their board and what you visited and found there (D-436)
function drawWorld() {
  const box = document.getElementById("worldMap"); if (!box) return;
  if (!WORLDMAP) { document.getElementById("worldCard").hidden = true; return; }
  const W = WORLDMAP, cur = board.region || 1, passed = new Set(state.run?.regions || []), k = 2;
  TRAVELLED[cur] = { board, visited: state.visited, discovered: state.discovered, at: state.caravan.at };   // what you've learned of each region entered (D-436)
  const key = `${cur}:${[...passed].join(",")}:${Object.keys(W.names || {}).length}:${state.visited.size}:${state.discovered.size}:${state.caravan.at}`; if (box.dataset.key === key) return; box.dataset.key = key;
  const s = el("svg", { viewBox: `-2 -2 ${W.W * k + 4} ${W.H * k + 4}`, width: "100%", role: "img", "aria-label": "World map" });
  s.append(el("rect", { x: 0, y: 0, width: W.W * k, height: W.H * k, fill: "#e9e2cc" }));
  for (const [x, y] of W.marsh) s.append(el("rect", { x: x * k, y: y * k, width: 2 * k, height: 2 * k, fill: "#b9c9a0", opacity: 0.8 }));
  for (const [x, y] of W.mountains) s.append(el("rect", { x: x * k, y: y * k, width: 2 * k, height: 2 * k, fill: "#a99a86" }));
  for (const [x, y] of W.lakes) s.append(el("rect", { x: x * k, y: y * k, width: k, height: k, fill: "#7fa7c9" }));
  for (const rv of W.rivers) s.append(el("polyline", { points: rv.map(([x, y]) => `${x * k + 1},${y * k + 1}`).join(" "), fill: "none", stroke: "#6d97bd", "stroke-width": 1.5 }));
  for (const [n, [x0, y0, x1, y1]] of Object.entries(W.regions)) {
    const r = +n, here = r === cur, done = passed.has(r);
    s.append(el("rect", { x: x0 * k, y: y0 * k, width: (x1 - x0) * k, height: (y1 - y0) * k, fill: here ? "rgba(138,45,28,0.12)" : done ? "rgba(60,60,60,0.18)" : "none",
      stroke: here ? "#8a2d1c" : "#5b4a33", "stroke-width": here ? 3 : 1 }));
    const corner = r in TRAVELLED, tx = corner ? x0 * k + 5 : (x0 + x1) / 2 * k, ty = corner ? y0 * k + 14 : (y0 + y1) / 2 * k, anchor = corner ? "start" : "middle";   // entered regions: label in the corner, clear of the roads
    const t = el("text", { x: tx, y: ty, "text-anchor": anchor, "font-size": 13, "font-weight": here ? 700 : 400, fill: done ? "#666" : "#2b2116" }, `${r}`);
    const t2 = el("text", { x: corner ? tx + 12 : tx, y: corner ? ty : ty + 13, "text-anchor": anchor, "font-size": 9, fill: "#5b4a33" }, (W.names || {})[n] || (WORLD_PARAM ? "…" : ""));
    s.append(t, t2);
  }
  const route = Object.keys(W.crossings).sort((a, b) => a - b).map((n) => W.crossings[n]);
  s.append(el("polyline", { points: [...route, W.capital].map(([x, y]) => `${x * k},${y * k}`).join(" "), fill: "none", stroke: "#8a2d1c", "stroke-width": 1.2, "stroke-dasharray": "4 3" }));
  for (const [x, y] of route) s.append(el("circle", { cx: x * k, cy: y * k, r: 3, fill: "#f6f1e4", stroke: "#8a2d1c", "stroke-width": 1.5 }));
  // D-436's accumulating overview: the roads, settlements (known on entry, D-715, D-718), POIs found and places visited of every
  // region you've entered; regions ahead show only their geography
  for (const [n, T] of Object.entries(TRAVELLED)) {
    const [ox, oy] = W.regions[n], P = ([x, y]) => `${(ox + x + 0.5) * k},${(oy + y + 0.5) * k}`, byId = Object.fromEntries(T.board.stops.map((x) => [x.id, x]));
    for (const l of T.board.legs) for (const g of l.segments) s.append(el("polyline", { points: g.cells.map(P).join(" "), fill: "none",
      stroke: g.cls === "water" ? "#6d97bd" : "#7a6548", "stroke-width": g.cls === "highway" ? 1.3 : g.cls === "secondary" ? 0.8 : 0.5, opacity: 0.75 }));
    for (const x of T.board.stops) {
      const [px_, py_] = P(x.cell).split(",").map(Number), seen = T.visited.has(x.id);
      if (x.kind === "settlement" || x.kind === "checkpoint") {
        const r = x.kind === "checkpoint" ? 3.2 : { village: 1.6, "market town": 2.4, town: 2.8, city: 3.4 }[x.tier] || 1.8;
        const c = el(x.kind === "checkpoint" ? "rect" : "circle", x.kind === "checkpoint" ? { x: px_ - r, y: py_ - r, width: 2 * r, height: 2 * r } : { cx: px_, cy: py_, r });
        c.setAttribute("fill", seen ? "#8a2d1c" : "#f6f1e4"); c.setAttribute("stroke", "#5b4a33"); c.setAttribute("stroke-width", 0.8);
        c.append(el("title", {}, `${x.name}${x.tier ? ` (${x.tier})` : ""}${seen ? " · visited" : ""}`)); s.append(c);
        if (x.tier && x.tier !== "village" || x.kind === "checkpoint") s.append(el("text", { x: px_ + r + 1.5, y: py_ + 2.5, "font-size": 6.5, fill: "#2b2116", class: "wmlabel" }, x.name));
      } else if (x.kind === "poi" && (T.discovered.has(x.id) || seen)) {
        const c = el("polygon", { points: `${px_},${py_ - 3} ${px_ + 3},${py_} ${px_},${py_ + 3} ${px_ - 3},${py_}`, fill: seen ? "#8a2d1c" : "#d9c38f", stroke: "#5b4a33", "stroke-width": 0.8 });
        c.append(el("title", {}, `${x.name}${seen ? " · visited" : " · found"}`)); s.append(c);
      }
    }
    if (+n === cur && byId[T.at]) { const [yx, yy] = P(byId[T.at].cell).split(",").map(Number); s.append(el("circle", { cx: yx, cy: yy, r: 5, fill: "none", stroke: "#b07d12", "stroke-width": 2 })); }
  }
  const [cx, cy] = W.capital; s.append(el("text", { x: cx * k, y: cy * k + 5, "text-anchor": "middle", "font-size": 16, fill: "#b07d12" }, "♛"));
  document.getElementById("worldTitle").textContent = `World map · Region ${cur} of 8`;
  box.replaceChildren(s, h("div", { className: "muted small" }, `You are in ${cur} · ${W.names?.[cur] || board.region_name} (gold ring). The dashed line runs border to border to the capital (♛) in Region 8. Grey: regions behind you. Regions you've entered keep their roads and settlements; red: places you've visited; diamonds: points of interest found.`),
    h("button", { className: "chip", style: "width:auto", onclick: () => { const L = h("div", { id: "worldBig", onclick: () => L.remove() }, h("div", { className: "helpbox" }, h("h2", {}, `World map · Region ${cur} of 8`), s.cloneNode(true), h("div", { className: "muted small" }, "Click anywhere to close. Hover a place for its name."))); document.body.append(L); } }, "Larger map"));
}
const REFS = params.get("refs") === "1";
const px = ([x, y]) => [board.map.pad + (x + 0.5) * board.map.cell, board.map.top + (y + 0.5) * board.map.cell];

// the region with three AI caravans (D-856 Milestone B; sim/world.js); &req=<scenario id> forces a checkpoint scenario (testing)
// your profile and the hideout (D-418, D-739): Goldbars, unlocked civilisations, permanent upgrades, titles; the hideout opens
// before the first run (no civ in the address) and after each run's summary
const PROFILE = loadProfile();
const CIV = PROFILE.unlocked.includes(params.get("civ")) ? params.get("civ") : "Farmfolk";
const world = MP ? MP.net.world() : newWorld(board, SEED, MODE, { req: params.get("req"), civ: CIV, captureBonus: captureBonus(PROFILE) });
// a new run gets a new world from the server (D-708); without the API, an error (no silent fallback, D-951)
async function startRun(civ, seed = 1 + Math.floor(Math.random() * 1e6)) {   // a fresh world and a fresh game seed each run
  const q = `&seed=${seed}&mode=${MODE}&civ=${encodeURIComponent(civ)}`;
  try { const r = await fetch("api/new-world"); if (!r.ok) throw new Error(); const { world: w } = await r.json(); location.search = `?world=${w}${q}`; }
  catch { showGenScreen("Couldn't reach the world generator. Is serve.py running? (Fixed test maps: ?region=w1-r1.)", true); }   // no silent fallback to world 1
}
// online: who the round is waiting on, and where the other players are (seen only at settlements and POIs, D-396)
function waitingText() {
  const others = world.humans.filter((x) => x !== state && !x.ended);
  if (world.waiting && world.waiting !== state) return `${world.waiting.human.name} is resolving their move${world.waiting.stops[world.waiting.caravan.at] ? ` at ${world.waiting.stops[world.waiting.caravan.at].name}` : ""}.`;
  const slow = others.filter((x) => !x.declared && options(x).phase === "declare");
  return slow.length ? `Waiting for ${slow.map((x) => x.human.name).join(" and ")} to declare.` : "The round is resolving…";
}
function playersLine() {
  const bits = world.humans.filter((x) => x !== state).map((x) => {
    const stop = x.stops[x.caravan.at], seen = stop && (stop.kind === "settlement" || stop.kind === "poi") && x.board === state.board;
    const st = x.ended ? (x.ended.won ? "through the checkpoint" : "out of the run") : world.waiting === x ? "moving" : x.declared ? "move declared" : options(x).phase === "declare" ? "choosing a move" : "busy";
    return `${x.human.name} (${x.human.civ}): ${st}${seen && !x.ended ? `, at ${stop.name}` : ""}`;
  });
  return h("div", { className: "small players" }, h("b", {}, "Other players: "), bits.join(" · ") || "none");
}
// online: the host sent the next region and everyone who passed has crossed (sim/multi.js applyRegion)
async function onRegion() {
  if (state.board.region !== board.region) { const before = state.log.length; await loadBoard(`${WORLD_ID}-r${state.board.region}`); newsFrom = before; lastAt = null; looks.clear(); payChoice.clear(); }
  await loadWorldMap(); render();
}
// the hideout's online choices: host a room, or join one by its code
function goOnline(civ, how) {
  const q = new URLSearchParams({ mp: how.mode, civ, name: how.name || "" }); if (how.code) q.set("code", how.code.toUpperCase());
  location.search = "?" + q.toString();
}
if (!MP && !params.get("civ") && !AUTOPLAY) openHideout(h, PROFILE, (civ, how) => how ? goOnline(civ, how) : startRun(civ));
let state = MP ? world.humans[MP.seat] : world.player;
window.__fatStacks = { world, rerender: () => render(), mp: MP, act: (a) => act(state, a), seat: () => state, onRegion: () => onRegion() };   // debugging and tests only
// "what just happened": every journal entry since the player's last decision is shown at the top of the panel, so no
// outcome is visible only in the journal
let newsFrom = 0;
const act = (st, a) => {
  newsFrom = st.log.length;
  if (MP) return void MP.net.send(a.type === "move" ? { k: "declare", a: encodeMove(st, a) } : { k: "act", a });   // the host checks and orders it
  const r = worldAct(world, a); flushAfter(world); return r;
};
// meetings with AI caravans: solo calls the world directly; online they go to the host like any move
let uiMeet = null;                                     // the stake builder (yours alone, never part of the shared game)
const curMeet = () => uiMeet ?? world.meet;
const sendMeet = (e) => MP.net.send({ k: "meet", ...e });
const challenge = (w, ai, yours, theirs) => MP ? sendMeet({ op: "challenge", ai: world.ais.indexOf(ai), yours: encodeStake(state.caravan, yours), theirs: encodeStake(ai.caravan, theirs) }) : challengeSolo(w, ai, yours, theirs);
const answer = (w, how, counter) => MP ? sendMeet({ op: "answer", how, counter: counter ? { yours: encodeStake(state.caravan, counter.yours), theirs: encodeStake(world.meet.ai.caravan, counter.theirs) } : null }) : answerSolo(w, how, counter);
const payToll = (w, pay) => MP ? sendMeet({ op: "toll", pay }) : payTollSolo(w, pay);
const trade = (w, ok) => MP ? sendMeet({ op: "trade", ok }) : tradeSolo(w, ok);
const ambushCaravan = (w, ai) => MP ? sendMeet({ op: "ambush", ai: world.ais.indexOf(ai) }) : ambushSolo(w, ai);
const finishDuel = (w) => MP ? sendMeet({ op: "finish-duel" }) : finishDuelSolo(w);
// a match online: your plays go to the host; the AI seats move when the host's accepted moves arrive (sim/multi.js settle)
const matchRemote = (m) => (MP ? (seat, action) => MP.net.send({ k: "zplay", z: { seat, ...encodeZ(m, seat, action) } }) : null);
let mountedHandle = null;
if (MP) MP.net.onChange((kind, info) => {
  if (kind === "rejected") { (state.log).push({ round: state.round, text: `Not accepted: ${info}`, kind: "warn" }); }
  if (kind === "note") state.log.push({ round: state.round, text: info, kind: "info" });
  if (kind === "region") return onRegion();
  render(); mountedHandle?.refresh?.();
});
// what you saw of another caravan when you looked (D-396): one look per caravan per round
const looks = new Map();
const CIV_COLOUR = { Farmfolk: "#8a5a2b", Clergy: "#a3262a", Forestfolk: "#2f6b3a", Tradesfolk: "#b07d12" };
function look(ai) { const k = ai.ai.civ + ":" + state.round; if (!looks.has(k)) looks.set(k, inspectCaravan(world, ai)); return looks.get(k); }
const payChoice = new Map();          // leg -> per-fee choice, chosen in the panel

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

function drawOverlay(opts) {
  overlay.replaceChildren();
  // hidden locations before discovery (D-859 (10)): POIs a large ?, encounter points a small ?
  for (const s of board.stops) {
    if (s.kind === "poi" && !state.discovered.has(s.id)) {
      const [x, y] = px(s.cell);
      overlay.append(el("circle", { cx: x, cy: y, r: 13, fill: "#f6f1e4", stroke: "#5b4a33", "stroke-width": 2 }),
                     el("text", { x, y: y + 6, "text-anchor": "middle", "font-size": 18, "font-weight": "bold", fill: "#5b4a33" }, "?"));
    }
    if (s.kind === "encounter" && !state.visited.has(s.id)) {
      const [x, y] = px(s.cell);
      overlay.append(el("circle", { cx: x, cy: y, r: 7, fill: "#f6f1e4", stroke: "#5b4a33", "stroke-width": 1.5 }),
                     el("text", { x, y: y + 4, "text-anchor": "middle", "font-size": 11, "font-weight": "bold", fill: "#5b4a33" }, "?"));
    }
  }
  // reachable next stops and the road to each
  roadEls.clear();
  if (opts.phase === "declare") opts.moves.forEach((m, k) => {
    const pts = m.leg.segments.flatMap((s) => s.cells).map(px).map((p) => p.join(",")).join(" ");
    const road = el("polyline", { points: pts, fill: "none", stroke: m.available ? "#1e5fbf" : "#999", "stroke-width": 4, "stroke-opacity": 0.35, "stroke-dasharray": "8 6", "stroke-linecap": "round" });
    const [x, y] = px(m.to.cell);
    const g = el("g", { style: m.available ? "cursor:pointer" : "" });
    g.append(el("circle", { cx: x, cy: y, r: 14, fill: m.available ? "#1e5fbf" : "#999", stroke: "#fff", "stroke-width": 3 }),
             el("text", { x, y: y + 5, "text-anchor": "middle", "font-size": 15, "font-weight": "bold", fill: "#fff" }, String(k + 1)));
    g.append(el("title", {}, `${k + 1}. ${placeName(m.to)} · stop ${m.to.stop}` + (m.fees.length ? ` · ${m.fees.map((f) => `${f.label} ${f.amount}`).join(", ")}` : " · free")));
    const on = () => highlight(k, true), off = () => highlight(k, false);
    g.addEventListener("mouseenter", on); g.addEventListener("mouseleave", off);
    if (m.available) g.addEventListener("click", () => doMove(m));
    roadEls.set(k, road);
    overlay.prepend(road); overlay.append(g);
  });
  // the run's starting point (D-160), drawn over the generator's "Entry" gate label
  const start = board.stops.find((s) => s.kind === "start");
  if (start) { const [x, y] = px(start.cell);
    overlay.append(el("rect", { x: x - 30, y: y - 34, width: 60, height: 16, rx: 3, fill: "#f6f1e4", stroke: "#2f6b3a" }),
                   el("text", { x, y: y - 22, "text-anchor": "middle", "font-size": 11, "font-weight": "bold", fill: "#2f6b3a" }, "Start")); }
  // the other caravans, where they can be seen: at settlements and POIs only (D-396, D-712)
  visibleCaravans(world).forEach((v, k) => { const [x, y] = px(v.stop.cell), dx = 16 + 12 * (k % 3), g = el("g", {});
    g.append(el("circle", { cx: x + dx, cy: y - 14, r: 8, fill: CIV_COLOUR[v.civ] || "#555", stroke: "#fff", "stroke-width": 2 }),
             el("text", { x: x + dx, y: y - 10, "text-anchor": "middle", "font-size": 10, fill: "#fff", "font-weight": "bold" }, v.civ[0]));
    const t = el("title"); t.textContent = `${v.name[0].toUpperCase() + v.name.slice(1)} (${v.civ}) at ${v.stop.name}`; g.append(t); overlay.append(g); });
  // the caravan
  const [cx, cy] = px(state.stops[state.caravan.at].cell);
  overlay.append(el("circle", { cx, cy, r: 22, fill: "none", stroke: "#8a2d1c", "stroke-width": 3, class: "pulse" }),
                 el("circle", { cx, cy, r: 13, fill: "#8a2d1c", stroke: "#fff", "stroke-width": 3 }),
                 el("text", { x: cx, y: cy + 5, "text-anchor": "middle", "font-size": 14, fill: "#fff", "font-weight": "bold" }, "⛟"));
}
const roadEls = new Map();
function highlight(k, on) {
  const r = roadEls.get(k); if (r) { r.setAttribute("stroke-opacity", on ? 0.95 : 0.35); r.setAttribute("stroke-width", on ? 7 : 4); r.setAttribute("stroke-dasharray", on ? "" : "8 6"); }
  const card = document.querySelector(`[data-move="${k}"]`); if (card) card.classList.toggle("hot", on);
}
// what a player knows about a place: hidden POIs stay unknown until visited (D-859 (10))
function placeName(s) {
  if (s.kind === "poi" && !state.discovered.has(s.id)) return "Unknown place";
  if (s.kind === "encounter") return "Roadside stop";
  if (s.kind === "checkpoint") return "The Checkpoint";
  return s.name;
}
// what the taverns said about a place you haven't found (D-435): every version heard, how often, no truth label
function rumourOf(s) {
  const r = state.rumours?.[s.id]; if (!r || !r.length) return "";
  const n = {}; for (const x of r) n[x] = (n[x] || 0) + 1;
  return "rumoured: " + Object.entries(n).map(([k, v]) => (v > 1 ? `${k} (heard ${v} times)` : k)).join(" or ");
}
function placeInfo(s) {
  if (s.kind === "settlement") return `${s.tier} · ${(s.services || []).join(", ") || "no services"} · people: ${(s.suits || []).join(", ")}`;
  if (s.kind === "poi") return state.discovered.has(s.id) ? `${s.poi} · people: ${(s.suits || []).join(", ")}` : rumourOf(s) || "something lies off the road here";
  if (s.kind === "encounter") {
    const built = Object.entries(s.odds || {}).filter(([e]) => ENCOUNTERS[e]?.status.startsWith("built")).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
    return `likely: ${built.join(", ")}`;
  }
  if (s.kind === "checkpoint") { const r = requirementStatus(state); return r.playtest ? r.label : `${r.title}: needs ${r.ask}; you have ${r.have}`; }
  return "";
}
const ROADS = { highway: "highway", secondary: "secondary road", local: "local road", water: "waterway" };

function doMove(m) {
  const pay = payChoice.get(m.leg) || defaultPayment(state, m.fees);
  const cards = pay.filter((p, i) => p === "card" && m.fees[i]).length;
  if (cards) {
    // D-861: always warn that a random cargo card will be taken; D-743: confirm a payment that could end the run
    const fatal = counted(state.caravan) - cards < RULES.cargoMinimum;   // a Locust Swarm taken would cost nothing; this errs safe
    const msg = `${cards} random cargo card${cards > 1 ? "s" : ""} will be taken to pay (more likely a dry card than an X or Ász).`
      + (fatal ? `\n\nThis drops your cargo below ${RULES.cargoMinimum} cards: the run will END.` : "");
    if (!confirm(msg)) return;
  }
  act(state, { type: "move", leg: m.leg, payments: pay });
  payChoice.clear(); render();
}

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v != null) e[k] = v; }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}

// ---- meetings with other caravans: challenges, wagers, tolls, trades, duels (sim/world.js)
let builder = null;
function wagerSide(title, side, pool, editable, ai) {
  return h("div", { className: "small" }, h("b", {}, title),
    h("div", { className: "chips" }, ...pool.map((x) => h("button", { className: `chip${side.cards.includes(x) ? " on" : ""}`, style: "width:auto",
      onclick: () => { const k = side.cards.indexOf(x); if (k >= 0) side.cards.splice(k, 1); else side.cards.push(x); render(); } }, `${label(x)} · ${cutValue(x)}`))),
    h("div", {}, "coins ", h("input", { type: "number", min: 0, value: side.coins, style: "width:5em", onchange: (e) => { side.coins = Math.max(0, Math.floor(+e.target.value || 0)); render(); } }),
      ` · total ${stakeValue(side)}`));
}
// would losing this stake drop the caravan below the cargo minimum (D-138, D-205)? Locust Swarms don't count either way
const fatalStake = (st) => counted(state.caravan) - (st.cards || []).filter((x) => !(x.roster === "agricultural roster" && x.suit === "Beasts" && x.rank === "VII")).length < RULES.cargoMinimum;
function meetingPanel(A) {
  const mt = curMeet(), who = (ai) => ai.ai.name[0].toUpperCase() + ai.ai.name.slice(1), c = state.caravan;
  const desc = (st) => [...(st.cards || []).map(label), ...(st.coins ? [`${st.coins} coins`] : [])].join(" + ") || "nothing";
  if (mt.kind === "duel" || mt.stage === "duel") {
    const layer = document.getElementById("matchLayer");
    if (mountedMatch !== mt.m) { mountedMatch = mt.m; layer.hidden = false;
      mountedHandle = mountMatch(layer, mt.m, { humans: AUTOPLAY ? [] : [0], pace: AUTOPLAY ? 60 : 450, remote: matchRemote(mt.m), title: `A duel with ${mt.ai.ai.name}`,
        subtitle: "personal cards only · at most two tricks · confrontation points decide (VII 7 · VIII 1 · IX 2 · X 3 · Alsó 4 · Felső 5 · Király 6 · Ász 8) · the wager is the only prize",
        onEnd: () => { layer.hidden = true; layer.innerHTML = ""; mountedMatch = null; newsFrom = state.log.length; finishDuel(world); render(); } }); }
    A.append(h("h2", {}, "Duelling…")); return;
  }
  if (mt.kind === "build") {
    const b = builder, theirsSeen = look(b.ai).cards;
    A.append(h("h2", {}, b.mode === "counter" ? "Your counteroffer" : `Challenge ${b.ai.ai.name}`),
      h("div", { className: "muted small" }, "Both stakes must be worth exactly the same (D-224): cargo at its value, coins at face value. Pick from your cargo and from the cards you saw on theirs."),
      wagerSide("You stake", b.yours, c.cargo, true), wagerSide("You ask of them", b.theirs, theirsSeen, true, b.ai),
      h("div", { className: stakeValue(b.yours) === stakeValue(b.theirs) && stakeValue(b.yours) > 0 ? "good" : "warn" }, `${stakeValue(b.yours)} against ${stakeValue(b.theirs)}`),
      ...(fatalStake(b.yours) ? [h("div", { className: "warn" }, `Careful: lose with this stake and you drop below ${RULES.cargoMinimum} cargo cards: the run ends.`)] : []),
      h("button", { className: "primary", disabled: stakeValue(b.yours) !== stakeValue(b.theirs) || stakeValue(b.yours) <= 0,
        onclick: () => { newsFrom = state.log.length; const ai = b.ai, mode = b.mode; uiMeet = null; builder = null;
          if (mode === "counter") answer(world, "counter", { yours: b.yours, theirs: b.theirs }); else challenge(world, ai, b.yours, b.theirs); render(); } }, b.mode === "counter" ? "Send the counteroffer" : "Send the challenge"),
      h("button", { onclick: () => { uiMeet = null; builder = null; render(); } }, "Back"));
    return;
  }
  if (mt.kind === "challenged") {
    const pr = mt.proposal;
    A.append(h("h2", {}, `${who(mt.ai)} challenges you to a duel`),
      h("div", {}, `They stake ${desc(pr.theirs)} (${stakeValue(pr.theirs)}) against your ${desc(pr.yours)} (${stakeValue(pr.yours)}).`),
      h("div", { className: "muted small" }, `A duel: your personal deck against theirs, at most two tricks; only the wager changes hands. If you refuse, ${{ Clergy: "the pilgrims let it go", Forestfolk: "the foresters may let it go, or demand a toll and attack if you won't pay", Tradesfolk: "the merchants offer a trade instead" }[mt.ai.ai.civ] || "they decide"} (D-412).`),
      ...(fatalStake(pr.yours) ? [h("div", { className: "warn" }, `Careful: you have ${counted(c)} cargo cards. Lose this duel and you drop below ${RULES.cargoMinimum}: the run ends.`)] : []),
      h("button", { className: `primary${fatalStake(pr.yours) ? " risk" : ""}`, onclick: () => { if (fatalStake(pr.yours) && !confirm(`Losing this duel ends the run (below ${RULES.cargoMinimum} cargo cards). Accept anyway?`)) return; newsFrom = state.log.length; answer(world, "accept"); render(); } }, "Accept"),
      h("button", { onclick: () => { builder = { ai: mt.ai, yours: { cards: [], coins: 0 }, theirs: { cards: [], coins: 0 }, mode: "counter", prev: mt }; uiMeet = { kind: "build", ai: mt.ai }; render(); } }, "Counteroffer (one only)"),
      h("button", { onclick: () => { newsFrom = state.log.length; answer(world, "refuse"); render(); } }, "Refuse"));
    return;
  }
  if (mt.kind === "toll") {
    A.append(h("h2", {}, `${who(mt.ai)} demands a toll`), h("div", {}, `Pay ${mt.amount} coins to pass, or refuse and they attack (an ordinary ambush).`),
      h("button", { className: "primary", disabled: c.coins < mt.amount, onclick: () => { newsFrom = state.log.length; payToll(world, true); render(); } }, `Pay ${mt.amount} coins`),
      h("button", { onclick: () => { newsFrom = state.log.length; payToll(world, false); render(); } }, "Refuse"));
    return;
  }
  if (mt.kind === "trade") {
    A.append(h("h2", {}, `${who(mt.ai)} offers a trade`),
      h("div", {}, `Your ${label(mt.give)} for their ${label(mt.get)}${mt.coins > 0 ? `, and they add ${mt.coins} coins` : mt.coins < 0 ? `, and you add ${-mt.coins} coins` : ""}.`),
      h("button", { className: "primary", onclick: () => { newsFrom = state.log.length; trade(world, true); render(); } }, "Trade"),
      h("button", { onclick: () => { newsFrom = state.log.length; trade(world, false); render(); } }, "Decline"));
  }
}
function render() {
  if (MP) world.player = state;                          // the shared world, seen from your seat
  const opts = options(state), c = state.caravan, here = state.stops[c.at];
  if (opts.phase === "ended" && (opts.ended.won || opts.ended.outOfCards)) {   // the scoreboard comes up once per checkpoint passed and on running out of cards
    const key = `${board.region}:${opts.ended.reason}`;
    if (scoreboardShown !== key) { scoreboardShown = key; showScoreboard(opts.ended); }
  }
  document.getElementById("regionName").textContent = `Region ${board.region || 1} · ${board.region_name} · you: ${PROFILE.title ? `the ${PROFILE.title} ` : ""}${CIV}`;
  { const goal = requirementStatus(state), sus = suspicion(state);
    const chip = (k, v, cls = "", title = "") => h("span", { className: `stat ${cls}`, title }, h("small", {}, k), h("b", {}, v));
    document.getElementById("statusbar").replaceChildren(
      chip("Stop", `${here.stop} / ${RULES.stopsPerRegion}`),
      chip("Coins", String(c.coins)),
      chip("Wagon", `${slots(c)} / ${c.capacity}`, counted(c) <= RULES.cargoMinimum ? "warnc" : "", `At least ${RULES.cargoMinimum} cargo cards or the run ends${c.cargo.some((x) => x.roster === "agricultural roster" && x.suit === "Beasts" && x.rank === "VII") ? " (Locust Swarms don't count)" : ""}`),
      chip(goal.playtest ? "Goal" : goal.title, goal.playtest ? `${goal.have} / ${goal.count}` : `${goal.short} ${goal.have} / ${goal.count}`, goal.met ? "okc" : "", goal.playtest ? goal.label : `Checkpoint: ${goal.title}: ${goal.ask}, across cargo and personal deck`),
      chip("Suspicion", `${sus.total}${sus.inspection ? ` → ${sus.inspection}-card search` : ""}`, sus.inspection ? "warnc" : "",
        `11+ means an inspection at the checkpoint (X and Ász count 1 each).\n${Object.entries(sus.parts).filter(([, v]) => v).map(([k, v]) => `${k} ${+v.toFixed(2)}`).join(" · ") || "nothing yet"}`),
      chip("Military", String(military(c)), "", "Your Sevens: they decide how much cargo you risk in an ambush"),
      chip("Round", String(state.round)));
  }

  // where we are
  // where we are: two lines at most
  const H = document.getElementById("here");
  H.replaceChildren(h("div", { className: "herehead" }, h("b", {}, here.kind === "start" ? "The starting point" : placeName(here)),
    here.kind === "settlement" ? h("span", { className: "muted" }, ` · ${here.tier}`) : here.kind === "poi" ? h("span", { className: "muted" }, ` · ${here.poi}`) : null));
  const where = [here.services?.length ? here.services.join(" · ") : null, here.suits?.length ? `people: ${here.suits.join(", ")}` : null].filter(Boolean);
  if (here.kind === "encounter") where.push(`likeliest: ${Object.entries(here.odds || {}).filter(([e]) => ENCOUNTERS[e]?.status.startsWith("built")).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e).join(", ")}`);
  if (where.length) H.append(h("div", { className: "muted small" }, where.join(" — ")));

  // what you can do, after what just happened
  const A = document.getElementById("actions"); A.replaceChildren();
  if (MP) A.append(playersLine());
  const news = state.log.slice(newsFrom).filter((e) => e.kind !== "growl");
  if (news.length && opts.phase !== "match") A.append(h("div", { className: "news" }, h("div", { className: "muted" }, "What just happened"),
    ...news.map((e) => h("div", { className: `n ${e.kind}` }, e.text))));
  const mercs = c.personal.filter((x) => x.merc);
  if (mercs.length && !["match", "ended"].includes(opts.phase)) A.append(h("div", { className: "small" }, "Your partner in encounters: ",
    ...[{ merc: null, name: "Companion" }, ...mercs].map((x) => h("button", { className: `chip${(c.partner ?? null) === (x.merc ?? null) ? " on" : ""}`, style: "width:auto",
      onclick: () => { act(state, { type: "set-partner", merc: x.merc ?? null }); render(); } }, x.name))));
  // the Avaricious Profiteer's shop (mercenary #4, from Hawker): wherever you are, at a price (markups provisional)
  const mshop = (opts.actions || []).filter((x) => x.type === "merc-shop");
  if (mshop.length) A.append(h("div", { className: "small" }, "The Profiteer's shop: ", ...mshop.map((x) => h("button", { className: "chip", style: "width:auto", disabled: !x.allowed,
    onclick: () => { act(state, { type: "merc-shop", i: x.i }); render(); } }, `${label(x.card)} · ${x.price}c`))));
  if (opts.phase === "ended" && opts.ended.crossing && board.region < 8) {
    const n = opts.ended.crossing;
    A.append(h("h2", {}, `Region ${board.region} complete`), h("p", { className: "ended won" }, opts.ended.reason),
      h("div", { className: "small" }, "Everything in your caravan crosses with you: coins, cargo, personal deck, mercenaries and investments. Foreign X and Ász fetch a premium at Fences across the border."),
      h("div", { className: "muted" }, "The other caravans:"), ...world.ais.map((ai) => h("div", { className: "small" },
        `${ai.ai.name[0].toUpperCase() + ai.ai.name.slice(1)} (${ai.ai.civ}): ${ai.ended ? (ai.ended.won ? "through the checkpoint" : "out: " + ai.ended.reason) : "still on the road"}`)),
      h("button", { onclick: () => showScoreboard(opts.ended) }, "Scoreboard"),
      MP ? h("p", { className: "muted" }, `Waiting for the other players to finish Region ${board.region}: everyone who passes crosses together.`)
      : h("button", { className: "primary", onclick: async (e) => { e.target.disabled = true; await waitForRegion(n, `Surveying the road into Region ${n}…`); await loadBoard(`${WORLD_ID}-r${n}`); await loadWorldMap(); const before = state.log.length; nextRegion(world, board); newsFrom = before; lastAt = null; looks.clear(); payChoice.clear(); render(); } }, `Cross into Region ${n}`));
  } else if (opts.phase === "ended") {
    const sc = runScore(state);
    const gb = awardRun(PROFILE, `${SEED}:${CIV}:${state.round}:${sc.total}`, sc.total, state.run.titles);
    A.append(h("h2", {}, "Run over"), h("p", { className: `ended ${opts.ended.won ? "won" : "lost"}` }, opts.ended.reason),
      h("div", { className: "small" }, `Regions passed: ${state.run.regions.length ? state.run.regions.join(", ") : "none"}.`),
      h("div", { className: "small" }, h("b", {}, `Score ${sc.total}`), " (weights provisional): ", Object.entries(sc.parts).map(([k, v]) => `${k} ${v}`).join(" · ")),
      h("div", { className: "small" }, `Goldbars earned: ${gb} (you have ${PROFILE.goldbars}).${state.run.titles.length ? ` Titles unlocked: ${state.run.titles.map((t) => `the ${t}`).join(", ")}.` : ""}`),
      h("button", { className: "primary", onclick: () => openHideout(h, PROFILE, (civ) => startRun(civ), `Run over: ${sc.total} points, ${gb} Goldbars.`) }, "Go to the hideout"),
      ...(c.investment && (c.investment.principal || c.investment.uncollected) ? [h("div", { className: "small" }, `Still invested: ${c.investment.principal} coins of principal and ${Math.ceil(c.investment.uncollected)} of uncollected dividends, counted as money earned (D-748).`)] : []),
      h("div", { className: "muted" }, "The other caravans:"), ...world.ais.map((ai) => h("div", { className: "small" },
        `${ai.ai.name[0].toUpperCase() + ai.ai.name.slice(1)} (${ai.ai.civ}): ${ai.ended ? (ai.ended.won ? "through the checkpoint" : "out: " + ai.ended.reason) : `still on the road, ${ai.caravan.cargo.length} cargo cards`}`)),
      ...(opts.ended.won || opts.ended.outOfCards ? [h("button", { onclick: () => showScoreboard(opts.ended) }, "Scoreboard")] : []),
      h("button", { onclick: () => startRun(CIV) }, `Run again as ${CIV} (a new world)`));
  } else if (opts.phase === "loot") {
    A.append(h("h2", {}, `What's left of ${opts.rival}`), h("div", { className: "muted" }, "Take what fits; the rest is abandoned (D-230)."),
      h("div", { className: "chips" }, ...opts.actions.filter((a) => a.type === "take").map((a) => h("button", { className: "chip", style: "width:auto", disabled: !a.allowed, onclick: () => { act(state, { type: "take", i: a.i }); render(); } }, label(a.card)))),
      h("button", { className: "primary", onclick: () => { act(state, { type: "done-loot" }); render(); } }, "Done"));
  } else if (opts.phase === "declare" && (curMeet() || (!MP && aiChallenges(world)))) {
    meetingPanel(A);
  } else if (MP && opts.phase === "declare" && state.declared) {
    const to = state.stops[state.declared.leg.to];
    A.append(h("h2", {}, "Move declared"), h("p", {}, `You're heading for ${to ? placeName(to) : "your next stop"}.`), h("p", { className: "muted" }, waitingText()));
  } else if (opts.phase === "declare") {
    // caravans in sight (D-396): you can look at any of them; a random few of their cargo cards and how full the wagon looks
    const seen = visibleCaravans(world);
    if (seen.length) A.append(h("details", { className: "small" }, h("summary", {}, `Caravans in sight: ${seen.map((v) => `${v.civ} at ${v.stop.name}`).join(" · ")}`),
      ...seen.map((v) => { const l = look(v.state);
        const what = l.screened ? "a reed screen hides the cargo (Privacy Screen)" : `you make out ${l.cards.length ? l.cards.map(cardName).join(", ") : "nothing"}`;
        const gossip = l.gossip ? ` Tavern Gossip: ${Object.entries(l.gossip).filter(([, n]) => n).map(([r, n]) => `${n} ${r}`).join(", ")}.` : "";
        return h("div", {}, h("b", {}, `${v.name[0].toUpperCase() + v.name.slice(1)}`), ` at ${v.stop.name}${v.how !== "seen" ? ` (${v.how})` : ""}: ${l.fullness}; ${what}.${gossip}`); })));
    // Nose for Wealth: the richest cargo in the region, yours included, with no value shown (D-717)
    if (c.personal.some((x) => x.suit === "Townsfolk" && x.rank === "X" && x.adjective === "Heady" && (!x.roster || x.roster === "main"))) {
      const rich = richest(world); A.append(h("div", { className: "small muted" }, `Nose for Wealth: ${rich === state ? "your own cargo is the richest in the region" : `${rich.ai.name} carries the richest cargo`}.`)); }
    const met = meetings(world);
    if (met.length) A.append(h("div", { className: "news" }, h("div", { className: "muted" }, "Another caravan is here (D-730)"),
      ...met.map((ai) => h("div", {}, h("b", {}, ai.ai.name[0].toUpperCase() + ai.ai.name.slice(1)), " ",
        h("button", { onclick: () => { builder = { ai, yours: { cards: [], coins: 0 }, theirs: { cards: [], coins: 0 }, mode: "challenge" }; uiMeet = { kind: "build", ai }; render(); } }, "Challenge to a duel"), " ",
        h("button", { onclick: () => { if (confirm("Ambush them? The ordinary ambush rules: exposure by military, your side leads.")) { ambushCaravan(world, ai); render(); } } }, "Ambush")))));
    A.append(h("h2", {}, c.emergency ? "Return to the checkpoint" : `Where next? (stop ${here.stop + 1} of ${RULES.stopsPerRegion})`),
      h("div", { className: "muted small" }, "Click a card, a numbered marker on the map, or press its number key."));
    opts.moves.forEach((m, k) => {
      const pay = payChoice.get(m.leg) || defaultPayment(state, m.fees); payChoice.set(m.leg, pay);
      const roads = m.waterway ? "Waterways (Fowler): by water, no tolls or fees" : [...new Set(m.leg.segments.map((x) => ROADS[x.cls] || x.cls))].join(" + ");
      // one line: the road, then each fee with a coins / card toggle
      const fee = (f, i) => f.waived ? h("span", { className: "fee free" }, f.robbery ? `toll: you collect +${f.robbery}` : "toll waived")
        : h("span", { className: "fee" }, `${f.label.replace(/^highway /, "")} ${f.amount}`, h("span", { className: "seg" },
            h("button", { className: pay[i] === "coins" ? "on" : "", disabled: c.coins < f.amount, title: "Pay in coins", onclick: (e) => { e.stopPropagation(); pay[i] = "coins"; render(); } }, "coins"),
            h("button", { className: pay[i] === "card" ? "on" : "", disabled: !c.cargo.length, title: "Pay with one random cargo card", onclick: (e) => { e.stopPropagation(); pay[i] = "card"; render(); } }, "card")));
      const card = h("div", { className: `dest ${m.available ? "" : "off"}`, onmouseenter: () => highlight(k, true), onmouseleave: () => highlight(k, false),
          onclick: (e) => { if (m.available && !e.target.closest(".seg")) doMove(m); } },
        h("div", { className: "go" }, h("span", { className: "num" }, String(k + 1)), h("b", {}, placeName(m.to)),
          m.to.kind === "settlement" ? h("span", { className: "muted" }, ` · ${m.to.tier}`) : null),
        h("div", { className: "info" }, placeInfo(m.to).replace(/^(village|market town|town|city) · /, "")),
        ...(m.foreseen !== undefined ? [h("div", { className: "good small" }, `Light the Way: ${m.foreseen || "a quiet stretch of road"} ahead.`)] : []),
        h("div", { className: "road" }, h("span", { className: "muted" }, roads), ...(m.fees.length ? m.fees.map(fee) : [h("span", { className: "fee free" }, "free")])),
        m.available ? null : h("div", { className: "warn" }, "You can't pay for this road."));
      card.dataset.move = k; A.append(card);
    });
    if (opts.trails && opts.trails.length) A.append(h("div", { className: "muted small", style: "margin-top:6px" }, "Game Trails (Treebark): cross to another place at this same stop, without progress:"),
      h("div", { className: "chips" }, opts.trails.map((t) => h("button", { className: "chip", style: "width:auto", onclick: () => { act(state, { type: "trail", to: t.to.id }); render(); } }, placeName(t.to)))));
  } else if (opts.phase === "match") {
    const layer = document.getElementById("matchLayer");
    if (mountedMatch !== opts.match) {
      mountedMatch = opts.match; layer.hidden = false;
      const cp = opts.match.kind === "checkpoint", amb = opts.match.kind === "ambush";
      mountedHandle = mountMatch(layer, opts.match, { humans: AUTOPLAY ? [] : [0], pace: AUTOPLAY ? 60 : 450, remote: matchRemote(opts.match),
        title: cp ? "Checkpoint encounter" : amb ? "Ambush!" : opts.match.kind === "friendly" ? "A friendly match" : `Zsír at ${here.name}`,
        subtitle: cp ? "your own cargo is the deck · every card the King's Men take is gone · you need 8 cargo cards afterwards to pass"
                 : opts.match.kind === "friendly" ? "your personal deck against theirs · two tricks · Zsír points decide · nothing is lost"
                 : amb ? "the deck is both sides' exposed cargo · cards change hands only when captured in a trick · the higher final cargo value wins, ties to the defender"
                     : opts.match.shared ? `you and ${opts.match.names[2]} against ${opts.match.names[1]} and ${opts.match.names[3]} · each seat keeps the cards it captures (D-914) · ${here.suits.slice(0, 4).join(", ")}`
                     : `you and ${opts.match.names[2] === "Companion" ? "your companion" : opts.match.names[2]} against two locals · ${here.suits.slice(0, 4).join(", ")} · keys 1–6 play a card, P passes`,
        onEnd: () => { layer.hidden = true; layer.innerHTML = ""; mountedMatch = null; act(state, { type: "match-done" }); render(); } });
    }
    A.append(h("h2", {}, "Playing Zsír…"));
  } else if (opts.phase === "negotiate") {
    const n = opts.nego;
    A.append(h("h2", {}, "Choose a partner"),
      h("div", { className: "muted" }, `At the table: ${n.npcs.map((x) => x.name).join(", ")}. Your partner plays with their own cards; the other two play against you${n.npcs.some((x) => x.kind === "caravan") ? " (a caravan keeps what its own seat captures)" : ""}.`));
    if (opts.stage === "pick") {
      A.append(h("p", {}, "Pick the deal you want before time runs out. Whoever picks the same deal becomes your partner."), h("div", { className: "countdown", id: "countdown" }, ""));
      for (const x of opts.actions.filter((y) => y.type === "offer"))
        A.append(h("button", { className: "group", disabled: !x.allowed, onclick: () => { act(state, { type: "offer", id: x.id }); render(); } }, x.offer.text));
      A.append(h("button", { onclick: () => { act(state, { type: "no-offer" }); render(); } }, "Make no offer"));
      if (negoFor !== n) {                                     // the 4-5 s window (D-263); on expiry: no offer
        negoFor = n; clearInterval(negoTimer); const end = Date.now() + opts.seconds * 1000;
        negoTimer = setInterval(() => { const left = Math.max(0, end - Date.now()), el = document.getElementById("countdown");
          if (el) el.textContent = `${(left / 1000).toFixed(1)} s`;
          if (!left) { clearInterval(negoTimer); const o = options(state); if (o.phase === "negotiate" && o.stage === "pick" && state.nego === n) { act(state, { type: "no-offer" }); render(); } } }, 100);
      }
    } else {
      A.append(h("p", {}, opts.stage === "matched" ? "More than one of them picked your deal. Choose your partner:" : "Nobody picked your deal. Choose a partner from what each of them asked for:"));
      for (const x of opts.actions.filter((y) => y.type === "partner")) A.append(h("button", { className: "group", disabled: !x.allowed, title: x.allowed ? "" : "You can't pay this", onclick: () => { act(state, { type: "partner", id: x.id }); render(); } },
        h("b", {}, x.npc.name + (x.npc.kind === "caravan" ? ` (${x.npc.ai.ai.civ} caravan)` : "")), h("div", { className: "muted" }, x.deal.text)));
      A.append(h("button", { onclick: () => { act(state, { type: "withdraw" }); render(); } }, "Walk away: no match"));
    }
  } else if (opts.phase === "event") {
    renderEvent(A, opts);
  } else if (opts.phase === "expose") {
    const a = opts.ambush;
    A.append(h("h2", {}, `${a.kind}: expose your cargo`),
      h("p", {}, `Military: you ${a.milP}, they ${a.milO}. You must expose ${a.needP} cargo cards (they expose ${a.needO}). Pick whole rows of four; the rest reshuffle after each pick. When the countdown ends, the rest is chosen at random (D-177).`),
      h("div", { className: "countdown", id: "countdown" }, ""),
      h("div", { className: "muted" }, `Still to expose: ${opts.need}`));
    opts.groups.forEach((g, i) => A.append(h("button", { className: "group", onclick: () => { act(state, { type: "expose-pick", i }); render(); } },
      h("div", { className: "chips" }, g.map((x) => h("span", { className: `chip ${x.rank === "X" || x.rank === "Ász" ? "rich" : x.rank === "IX" ? "ix" : ""}` }, label(x)))))));
    if (exposeFor !== a) {                                   // one countdown for the whole phase, never reset (D-177)
      exposeFor = a; clearInterval(exposeTimer);
      const end = Date.now() + opts.seconds * 1000;
      exposeTimer = setInterval(() => {
        const left = Math.max(0, end - Date.now()), el = document.getElementById("countdown");
        if (el) el.textContent = `${(left / 1000).toFixed(1)} s`;
        if (!left) { clearInterval(exposeTimer); if (options(state).phase === "expose" && state.ambush === a) { act(state, { type: "expose-timeout" }); render(); } }
      }, 100);
    }
  } else if (opts.phase === "recruit") {
    A.append(h("h2", {}, "Recruit a captured card?"),
      h("div", { className: "muted" }, "You may move at most one card captured in this match from cargo into your personal deck: add it, or swap it for a personal card (D-025, D-319). Personal cards are your hand's 2 extra cards in every match, and only cards in the personal deck give their personal-deck abilities."),
      h("div", { className: "chips" }, opts.eligible.map((x, i) => h("button", { className: `chip ${recruitSel === i ? "sel" : ""}`, style: "width:auto",
        onclick: () => { recruitSel = i; render(); } }, label(x)))));
    if (recruitSel != null && opts.eligible[recruitSel]) {
      const i = recruitSel, x = opts.eligible[i];
      const go = (swap) => {
        const p = recruitPreview(state, i, swap);
        if (p.endsRun && !confirm(`This leaves ${p.cargoAfter} cargo cards, below ${RULES.cargoMinimum}: the run will END. Recruit anyway?`)) return;
        recruitSel = null; act(state, swap == null ? { type: "recruit", i } : { type: "recruit", i, swap }); render();
      };
      const pa = recruitPreview(state, i, null);
      A.append(h("button", { className: "primary", onclick: () => go(null) }, `Add ${label(x)} to the personal deck (cargo ${pa.cargoAfter})`));
      if (pa.endsRun) A.append(h("div", { className: "warn" }, `Cargo would fall below ${RULES.cargoMinimum}: the run would end.`));
      A.append(h("div", { className: "muted" }, "…or swap it for (the swapped-out card goes into your cargo, D-868):"));
      A.append(h("div", { className: "chips" }, opts.personal.map((y, j) => {
        const p = recruitPreview(state, i, j);
        return h("button", { className: `chip ${p.capacity < p.capacityBefore ? "risk" : ""}`, style: "width:auto",
          title: p.capacity < p.capacityBefore ? `Capacity would drop from ${p.capacityBefore} to ${p.capacity}` : "",
          onclick: () => { if (p.capacity < p.capacityBefore && !confirm(`Swapping out ${cardName(y)} drops your capacity from ${p.capacityBefore} to ${p.capacity}. Continue?`)) return; go(j); } },
          `${label(y)}${p.capacity < p.capacityBefore ? ` ⚠ capacity ${p.capacityBefore}→${p.capacity}` : ""}`);
      })));
    }
    A.append(h("button", { onclick: () => { recruitSel = null; act(state, { type: "skip-recruit" }); render(); } }, "Recruit nothing"));
  } else if (opts.phase === "guard") {
    A.append(h("h2", {}, "A guard at the barrier"), h("p", {}, `No inspection is scheduled, but this guard wants ${opts.bribe} coins (routine inspection, D-135; amount provisional). Refuse and he searches 3 random cards from your cargo and personal deck.`),
      h("button", { className: "primary", disabled: !opts.actions[0].allowed, onclick: () => { act(state, { type: "pay-guard" }); render(); } }, `Pay ${opts.bribe} coins`),
      h("button", { onclick: () => { act(state, { type: "refuse-guard" }); render(); } }, "Refuse: let him search"));
  } else if (opts.phase === "breakaway") {
    A.append(h("h2", {}, opts.ambush.kind), h("p", {}, `Your horseman can try to break away before the fight: ${Math.round(opts.chance * 100)}%. Success avoids the encounter (no rewards); failure means you fight as normal.`),
      h("button", { className: "primary", onclick: () => { act(state, { type: "breakaway" }); render(); } }, `Breakaway (${Math.round(opts.chance * 100)}%)`),
      h("button", { onclick: () => { act(state, { type: "stand" }); render(); } }, "Stand and face them"));
  } else if (opts.phase === "discovery") {
    const ins = opts.inspection;
    A.append(h("h2", {}, `Contraband found (inspection ${ins.n})`),
      h("div", { className: "chips" }, ins.drawn.map((d) => h("span", { className: `chip ${ins.found.includes(d) ? "rich" : ""}` }, `${d.card.rank} ${d.card.suit}${d.from === "personal" ? " (personal)" : ""}`))),
      h("p", {}, ins.n === 1 ? "Surrender gives up only the X/Ász found, for good, and triggers a second inspection of random size. Fight starts a Zsír encounter against two King's Men played with your own cargo: anything they capture is lost."
                             : "Surrender gives up only these X/Ász and ends the inspection. Fight starts the checkpoint encounter."),
      ...(opts.actions.some((a) => a.type === "bribe")
        ? [h("div", { className: "muted" }, "Bribe the inspector: offer part of your coins. Paid only if he accepts; if he refuses, the guards attack (the checkpoint encounter). Chances are provisional."),
           h("div", { className: "chips" }, opts.actions.filter((a) => a.type === "bribe").map((a) => h("button", { className: "chip", style: "width:auto",
             onclick: () => { act(state, { type: "bribe", share: a.share }); render(); } }, `Offer ${a.amount} coins (${Math.round(a.share * 100)}%) · ${Math.round(a.chance * 100)}% chance`)))]
        : [h("div", { className: "muted" }, "No bribe: that needs a qualifying card (Coveted Tradesfolk X in cargo, or a Radiant Clergy Ász in your personal deck; D-737).")]),
      h("div", { className: "warn" }, "In the encounter your personal cards are at stake too: any you or your companion play can be captured and lost, or end up as cargo if your team takes the trick (D-140)."
        + (c.personal.some(FARMFOLK_IX.expandedCarryingCapacity) ? " That includes Farmer's Papers: if it leaves your personal deck, capacity drops from 40 to 32." : "")),
      h("button", { className: "primary", onclick: () => { act(state, { type: "fight" }); render(); } }, "Fight (checkpoint encounter)"),
      h("button", { onclick: () => { act(state, { type: "surrender" }); render(); } }, `Surrender ${ins.found.length} card${ins.found.length === 1 ? "" : "s"}`),
      opts.actions.some((a) => a.type === "plumage") ? h("button", { onclick: () => { if (confirm("Give up the Ornamental Plumage for good, and pass without the checkpoint encounter?")) { act(state, { type: "plumage" }); render(); } } }, "Give up the Ornamental Plumage (pass as nobility)") : null);
  } else if (opts.phase === "overflow") {
    A.append(h("h2", {}, "The wagon is over capacity"),
      h("div", { className: "warn" }, `Make room for ${opts.excess} card${opts.excess === 1 ? "" : "s"}. ${opts.market ? "Sell them at this market, or leave them behind." : "Click a card to leave it behind."}`));
    if (opts.market) A.append(h("div", { className: "muted" }, "Sell:"), h("div", { className: "chips" }, opts.actions.filter((x) => x.type === "sell-excess").map((x) =>
      h("button", { className: "chip", style: "width:auto", onclick: () => { act(state, { type: "sell-excess", i: x.i }); render(); } }, `${label(x.card)}${x.bundle > 1 ? ` (bundle of ${x.bundle})` : ""} → ${x.price}`))));
    A.append(h("div", { className: "muted" }, "Leave behind (no coins):"), h("div", { className: "chips" }, opts.actions.filter((x) => x.type === "discard").map((x) =>
      h("button", { className: "chip", style: "width:auto", onclick: () => { act(state, { type: "discard", i: x.i }); render(); } }, `${label(x.card)}${x.bundle > 1 ? ` (bundle of ${x.bundle})` : ""}`))));
  } else if (opts.phase === "match-offer") {
    A.append(h("h2", {}, "A Zsír match is on offer"), h("div", { className: "muted" }, here.kind === "poi"
      ? `Optional. Three locals are here (${here.suits.slice(0, 4).join(", ")}); you'll strike a deal with one of them as your partner. As a ${here.poi}, its deck holds richer goods than a settlement's. Every card your team captures goes into your cargo.`
      : `Optional. You and your companion against two locals, with the locals' deck of ${here.suits.slice(0, 4).join(", ")}. Every encounter card your team captures goes into your cargo.`
        + (visibleCaravans(world).some((v) => v.at === here.id) ? " Other caravans here may take seats; if they do, each seat keeps only the cards it captures itself (D-914)." : "")),
      h("button", { className: "primary", onclick: () => { act(state, { type: "accept" }); render(); } }, "Play the match"),
      h("button", { onclick: () => { act(state, { type: "decline" }); render(); } }, "Decline"));
  } else if (opts.phase === "location") {
    if (opts.actions.some((x) => x.type === "royal-castle")) A.append(h("p", { className: "small" }, `Castle Town: every road ends here. The Royal Castle beyond is the final inspection: ${state.requirement.ask}, and failure ends the run. If you pass, the castle buys all your cargo by its tastes (${state.castle ? `${state.castle.king} the King's favourite, ${state.castle.up} wanted, ${state.castle.down} not` : "unknown"}).`),
      h("button", { className: "primary", onclick: () => { if (confirm("Go up to the Royal Castle? You can't come back to Castle Town.")) { act(state, { type: "royal-castle" }); render(); } } }, "Go to the Royal Castle (final inspection)"));
    else A.append(h("button", { className: "primary", onclick: () => { act(state, { type: "leave" }); render(); } }, "Done here: choose the next stop"));
    // each service is a section the player can fold away (remembered for this run)
    const secs = {}, ORDER = ["market", "Guild", "Magistrates", "tavern", "fence", "bank", "Church"];
    const section = (key, title) => { const d = h("details", { className: "svc", open: !folded.has(key), ontoggle: () => { if (d.open) folded.delete(key); else folded.add(key); } }, h("summary", {}, h("h2", {}, title))); secs[key] = d; return d; };
    const outer = A; let sec;
    // the Tavern (D-393): mercenaries for hire, their upgrade packages, selling them back (prices provisional, MER-03)
    const tvActs = opts.actions.filter((x) => ["hire", "merc-upgrade", "merc-sell"].includes(x.type)) , hasTavern = opts.actions.some((x) => x.type === "tavern-buy") || tvActs.length;
    if (hasTavern) { const T = section("tavern", "Tavern");
      if (tvActs.length) T.append(h("div", { className: "muted" }, "Mercenaries"), h("div", { className: "chips" }, ...tvActs.map((x) =>
        x.type === "hire" ? h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, title: x.card.note, onclick: () => { act(state, { type: "hire", merc: x.merc }); render(); } }, `Hire ${x.card.name} · ${x.price}c`)
        : x.type === "merc-upgrade" ? h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, onclick: () => { act(state, { type: "merc-upgrade", merc: x.merc }); render(); } }, `${x.card.name} → ${x.next} · ${x.price}c`)
        : h("button", { className: "chip", style: "width:auto", onclick: () => { if (confirm(`Sell ${x.card.name} for ${x.price} coins?`)) { act(state, { type: "merc-sell", merc: x.merc }); render(); } } }, `Sell ${x.card.name} · ${x.price}c`))));
      const food = opts.actions.filter((x) => x.type === "tavern-buy");
      if (food.length) T.append(h("div", { className: "muted" }, "Food and drink"), h("div", { className: "chips" }, food.map((x) => h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, onclick: () => { act(state, { type: "tavern-buy", i: x.i }); render(); } }, `${label(x.card)} · ${x.price}c`))));
      T.append(h("div", { className: "muted small" }, "A mercenary lives in your personal deck; pick it as your partner (above) and it plays its own deck instead of your companion, except at POIs. Hover for what each does."));
    }
    // investments (D-659, D-747, D-825): the Banking House holds your principal; any Guild pays the dividends that accrue each round
    const inv = c.investment || { principal: 0, uncollected: 0 }, bankAct = opts.actions.find((x) => x.type === "invest"), col = opts.actions.find((x) => x.type === "collect-dividends");
    if (bankAct || col || inv.principal > 0) { const B = section("bank", bankAct ? "Banking House" : "Investments");
      B.append(h("div", { className: "muted", title: "Dividends accrue each round on what's invested and are collected at any Guild (rate provisional)." }, `Invested ${inv.principal} · dividends waiting ${Math.ceil(inv.uncollected)} · ${Math.round(PLACEHOLDER.dividendPerRound * 1000) / 10}% a round`));
      if (bankAct) { const amt = h("input", { type: "number", min: 1, max: c.coins, value: Math.min(10, c.coins), style: "width:5em" });
        B.append(h("div", { className: "chips" }, amt,
          h("button", { className: "chip", style: "width:auto", disabled: !c.coins, onclick: () => { act(state, { type: "invest", amount: +amt.value }); render(); } }, "Invest"),
          inv.principal > 0 ? h("button", { className: "chip", style: "width:auto", onclick: () => { act(state, { type: "withdraw", amount: Math.min(+amt.value, inv.principal) }); render(); } }, "Withdraw") : null,
          inv.principal > 0 ? h("button", { className: "chip", style: "width:auto", onclick: () => { act(state, { type: "close-investment" }); render(); } }, "Close it") : null)); }
      if (col) B.append(h("button", { className: "primary", onclick: () => { act(state, { type: "collect-dividends" }); render(); } }, `Collect ${col.amount} coins of dividends`)); }
    // the Fence (D-112, D-812, D-663): blind bins, illicit goods, now and then an X; prices and odds provisional (SET-07)
    const bin = opts.actions.find((x) => x.type === "fence-bin");
    if (bin) { const F = section("fence", "Fence");
      const sm = opts.actions.filter((x) => x.type === "fence-smuggle");
      if (sm.length) F.append(h("div", { className: "muted" }, "Smuggled valuables: X and Ász from other regions (the farther they've come, the more he pays)"), h("div", { className: "chips" }, sm.map((x) => h("button", { className: `chip rich${x.endsRun ? " risk" : ""}`, style: "width:auto", title: `From Region ${x.from}, ${x.distance} leagues away`,
        onclick: () => { if (x.endsRun && !confirm(`This drops your cargo below ${RULES.cargoMinimum} cards: the run will END. Sell anyway?`)) return; act(state, { type: "fence-smuggle", i: x.i }); render(); } }, `${label(x.card)} (R${x.from}) → ${x.price}`))));
      F.append(h("div", { className: "chips" }, h("button", { className: "chip", style: "width:auto", disabled: !bin.allowed, title: "A few cards of any suit, unseen until you pay; now and then something valuable or upgraded. Prices provisional.",
        onclick: () => { act(state, { type: "fence-bin" }); render(); } }, `Blind bin (${bin.size} cards, unseen) · ${bin.price}c`)));
      const fb = opts.actions.filter((x) => x.type === "fence-buy"), fs = opts.actions.filter((x) => x.type === "fence-sell");
      if (fb.length) F.append(h("div", { className: "muted" }, "Under the counter"), h("div", { className: "chips" }, fb.map((x) => h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, onclick: () => { act(state, { type: "fence-buy", i: x.i }); render(); } }, `${label(x.card)} · ${x.price}c`))));
      if (fs.length) F.append(h("div", { className: "muted" }, "Sell your illicit goods"), h("div", { className: "chips" }, fs.map((x) => h("button", { className: `chip${x.endsRun ? " risk" : ""}`, style: "width:auto",
        onclick: () => { if (x.endsRun && !confirm(`This drops your cargo below ${RULES.cargoMinimum} cards: the run will END. Sell anyway?`)) return; act(state, { type: "fence-sell", i: x.i }); render(); } }, `${label(x.card)} → ${x.price}`)))); }
    const m = opts.market;
    if (m) { sec = section("market", "Market"); const A = sec;
      A.append(h("div", { className: "muted" }, `In demand here: ${m.demand.up} (sells higher)${m.demand.down ? ` · not wanted: ${m.demand.down} (sells lower)` : ""} · test prices`));
      const buys = opts.actions.filter((x) => x.type === "buy"), sells = opts.actions.filter((x) => x.type === "sell");
      A.append(h("div", { className: "muted" }, `For sale (${buys.length}/${m.size})`));
      if (!buys.length) A.append(h("div", { className: "muted" }, "Sold out. Stock refreshes a little each round, or pay to restock."));
      A.append(h("div", { className: "chips" }, buys.map((x) => h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, title: x.allowed ? "Buy" : (c.cargo.length >= c.capacity ? "Wagon full" : "Not enough coins"),
        onclick: () => { act(state, { type: "buy", i: x.i }); render(); } }, `${label(x.card)} · ${x.price}c`))));
      const rs = opts.actions.find((x) => x.type === "restock");
      A.append(h("div", { className: "chips" }, h("button", { className: "chip", style: "width:auto", disabled: !rs.allowed, title: "New stock now (fee provisional)", onclick: () => { act(state, { type: "restock" }); render(); } }, `Restock · ${rs.price}c`)));
      A.append(h("div", { className: "muted" }, `Sell from your cargo · goods whose people don't live here (highlighted) sell at full value; ${here.suits?.length ? here.suits.join(", ") : "local"} goods at half`));
      A.append(h("div", { className: "chips" }, sells.map((x) => h("button", { className: `chip${(here.suits || []).includes(x.card.suit) ? "" : " rich"}`, style: "width:auto",
        onclick: () => { if (x.endsRun && !confirm(`Selling this drops your cargo below ${RULES.cargoMinimum} cards: the run will END. Sell anyway?`)) return; act(state, { type: "sell", i: x.i }); render(); } },
        `${label(x.card)}${x.bundle > 1 ? ` (bundle of ${x.bundle})` : ""} → ${x.price}`))));
    }
    // upgrade services: what this settlement's Guild / Magistrates offer for your cards (only the next step is shown, D-676)
    const ups = opts.actions.filter((x) => x.type === "upgrade");
    for (const inst of ["Guild", "Magistrates"]) if (opts.services.includes(inst)) {
      const mine = ups.filter((x) => x.at === inst);
      const A = section(inst, `${inst === "Guild" ? "Craftsmen's Guild" : "Magistrate's Office"} (${mine.filter((x) => x.allowed).length} affordable of ${mine.length})`);
      A.append(h("div", { className: "muted small" }, "Only the next step is shown; prices are DRAFT. Click a line to read the whole effect."));
      if (!mine.length) A.append(h("div", { className: "muted" }, "Nothing here for the cards you carry."));
      // one row per distinct card (identical copies merged), cargo first, then the personal deck
      for (const deck of ["cargo", "personal"]) {
        const rows = new Map();
        for (const x of mine.filter((y) => y.deck === deck)) { const k = label(x.card); const r = rows.get(k) || { card: x.card, n: new Set(), tracks: new Map() }; r.n.add(x.i); if (!r.tracks.has(x.track)) r.tracks.set(x.track, x); rows.set(k, r); }
        if (!rows.size) continue;
        A.append(h("div", { className: "muted small upg-head" }, deck === "cargo" ? "Cargo" : "Personal deck"));
        for (const r of rows.values()) {
          const xs = [...r.tracks.values()], t = xs.map((x) => (x.gives.startsWith(x.to) ? x.gives : `${x.track === "refine" ? x.to : x.to + " (adjective)"}: ${x.gives}`)).join("  ·  ")
            + (deck === "cargo" && r.card.rank === "IX" && r.tracks.has("refine") ? " Its passives only work once the card is in your personal deck." : "");
          const d = h("div", { className: "fees clamp", title: t, onclick: () => d.classList.toggle("clamp") }, t);
          A.append(h("div", { className: "upg" }, h("span", { className: "upg-card" }, `${label(r.card)}${r.n.size > 1 ? ` ×${r.n.size}` : ""}`),
            h("span", { className: "upg-btns" }, ...xs.map((x) => h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, title: x.allowed ? x.gives : "Not enough coins",
              onclick: () => { act(state, { type: "upgrade", deck: x.deck, i: x.i, track: x.track }); render(); } }, `${x.track === "refine" ? "→ " + x.to : "+ " + x.to.replace(/ .*/, "")} · ${x.price}c`))), d));
        }
      }
    }
    if (opts.church) {
      const bl = opts.actions.filter((x) => x.type === "attrition");
      const A = section("Church", "Church");
      A.append(h("div", { className: "muted small" }, `Attrition blessing: ${bl[0]?.price ?? "?"} coins per card (test price). A blessed card can be played sideways in a match for its rank's effect, instead of normally. Hover a card for its effect.`),
        h("div", { className: "chips" }, bl.map((x) => h("button", { className: "chip", style: "width:auto", disabled: !x.allowed, title: `${x.card.rank}: ${ATTRITION[x.card.rank]}`,
          onclick: () => { act(state, { type: "attrition", deck: x.deck, i: x.i }); render(); } }, `${label(x.card)}${x.deck === "personal" ? " (personal)" : ""}`))));
    }
    for (const k of ORDER) if (secs[k]) outer.append(secs[k]);
    for (const [k, d] of Object.entries(secs)) if (!ORDER.includes(k)) outer.append(d);
  } else if (opts.phase === "checkpoint") {
    const r = opts.requirement;
    A.append(h("h2", {}, "The Checkpoint"), h("p", {}, r.playtest ? `${r.label}. You have ${r.have}${r.suits.length ? ` (${r.suits.join(", ")})` : ""}.` : `${r.title}: the guards want ${r.ask}. You have ${r.have}.`),
      h("div", { className: "muted" }, "You can't wait here: trade, then submit, or take the emergency return."),
      (() => { const sus = suspicion(state); return h("p", { className: sus.inspection ? "warn" : "muted" }, `Suspicion ${sus.total}: ${sus.inspection ? `a scheduled inspection of ${sus.inspection} cards awaits` : "no scheduled inspection, though a guard may still ask for a bribe"}.`); })(),
      ...opts.actions.filter((a) => a.type === "bribery").map((a) => h("button", { disabled: !a.allowed, onclick: () => { act(state, { type: "bribery", i: a.i, deck: a.deck }); render(); } },
        `Bribery: ${label(a.card)} buys ${Math.round(a.pct * 100)}% concealment · ${a.price} coins`)),
      ...opts.actions.filter((a) => a.type === "req-bribe").map((a) => a.price === undefined ? h("div", { className: "muted" }, `Requirement bribe not possible: ${a.why}.`)
        : h("button", { disabled: !a.allowed, onclick: () => { act(state, { type: "req-bribe" }); render(); } }, `Bribe away the ${a.missing} missing card${a.missing === 1 ? "" : "s"} · ${a.price} coins`)));
    // submitting comes last: trade, bribe or take the emergency return first (the order you'd use them in)
    const submitBtn = h("button", { className: `primary${r.met ? "" : " risk"}`, style: "margin-top:10px", onclick: () => { if (confirm(r.met ? "Submit to the checkpoint?" : "Requirements are NOT met: submitting ends the run. Submit anyway?")) { act(state, { type: "submit" }); render(); } } },
      r.met ? "Submit to the inspection (irreversible)" : r.expedited ? `Submit: requirements NOT met (${r.have} of ${r.count}); Expedited Inspection gives a ${Math.round(PLACEHOLDER.expeditedChance * 100)}% chance, otherwise the run ends` : `Submit anyway: requirements NOT met (${r.have} of ${r.count}), the run ends`);
    { const buys = opts.actions.filter((x) => x.type === "cp-buy"), sells = opts.actions.filter((x) => x.type === "cp-sell");
      A.append(h("h2", { style: "margin-top:10px" }, "Checkpoint Trader"),
        h("div", { className: "muted" }, "A shady last resort: sells at a heavy markup, buys for a pittance. What he has is luck, not what the checkpoint wants. Test prices."));
      if (!buys.length) A.append(h("div", { className: "muted" }, "Nothing left for sale."));
      A.append(h("div", { className: "chips" }, buys.map((x) => h("button", { className: `chip${!r.playtest && r.test && r.test(x.card) ? " ix" : ""}`, style: "width:auto", disabled: !x.allowed, title: (x.why ? `Can't buy: ${x.why}` : "Buy") + (!r.playtest && r.test && r.test(x.card) ? " · the guards want this" : ""),
        onclick: () => { act(state, { type: "cp-buy", i: x.i }); render(); } }, `${label(x.card)} · ${x.price}c`))));
      if (buys.length && buys.every((x) => !x.allowed)) A.append(h("div", { className: "muted small" }, `Nothing you can buy: ${buys[0].why}.`));
      A.append(h("div", { className: "muted" }, sells.some((x) => x.endsRun) ? `Sell to him (you're at the ${RULES.cargoMinimum}-card minimum: any sale ends the run):` : "Sell to him:"), h("div", { className: "chips" }, sells.map((x) => h("button", { className: `chip${x.endsRun ? " risk" : ""}`, style: "width:auto",
        onclick: () => { if (x.endsRun && !confirm(`Selling this drops your cargo below ${RULES.cargoMinimum} cards: the run will END. Sell anyway?`)) return; act(state, { type: "cp-sell", i: x.i }); render(); } }, `${label(x.card)}${x.bundle > 1 ? ` (bundle of ${x.bundle})` : ""} → ${x.price}`)))); }
    { const em = opts.actions.find((a) => a.type === "emergency");
      A.append(h("h2", { style: "margin-top:10px" }, "Emergency return"),
        h("div", { className: "muted small" }, em.target ? `Back down the highway to ${em.target} for one settlement visit, then return next round. Costs ${em.cost} coins (both highway tolls, coins only); once per checkpoint.` : "Not possible from this checkpoint."),
        h("button", { disabled: !em.allowed, title: em.why || "", onclick: () => {
          if (em.cards && !confirm(`You can't cover the toll${em.cards > 1 ? "s" : ""} in coins: ${em.cards} random cargo card${em.cards > 1 ? "s" : ""} will be taken (one now${em.cards > 1 ? ", one on the way back" : ""}).`
            + (em.endsRun ? `\n\nThat drops your cargo below ${RULES.cargoMinimum} cards: the run will END.` : ""))) return;
          act(state, { type: "emergency" }); render(); } }, em.allowed ? `Take the emergency return to ${em.target}` : `Emergency return unavailable: ${em.why}`)); }
    A.append(submitBtn);
  }

  // the caravan
  const C = document.getElementById("caravan"); const goal = requirementStatus(state);
  const wanted = (x) => !goal.playtest && goal.test(x);
  // where a card came from (D-417, D-422): foreign X and Ász fetch a smuggling premium at Fences
  const foreign = (x) => x.home != null && x.home !== (board.region || 1);
  const from = (x) => (foreign(x) ? ` · from Region ${x.home}${x.rank === "X" || x.rank === "Ász" ? ": a Fence pays a premium" : ""}` : "");
  // a compact view: one row per rank, a small coloured tile per card (hover for its name); the full list on demand
  const SUIT_COL = { Farmfolk: "#8a5a2b", Clergy: "#b0302a", Forestfolk: "#3d7a3a", Tradesfolk: "#c9962b", Plainsfolk: "#b89a3e", Townsfolk: "#4f6480",
    Carnivalfolk: "#7d3f8c", Beasts: "#5c4a3a", Bandits: "#2b2b2b", "King's Men": "#284f9e", Hillfolk: "#707070", Fisherfolk: "#2f7f86", Corruption: "#c2185b" };
  // one grid: a row per rank, cargo tiles then personal-deck tiles (hover a tile for the card)
  const tiles = (xs) => h("span", { className: "tiles" }, ...xs.map((x) => h("span", { className: `tile${x.refined || x.adjective ? " up" : ""}${unbuiltAbilities(x).length ? " unb" : ""}`,
    title: label(x) + (wanted(x) ? " (the checkpoint wants this)" : "") + from(x), style: `background:${SUIT_COL[x.suit] || "#999"}` })));
  const grid = h("div", { className: "rgrid two" }, h("span", {}), h("span", { className: "muted small" }, `cargo ${c.cargo.length}${c.passenger ? " + passenger" : ""}`), h("span", { className: "muted small" }, `personal ${c.personal.length}`),
    ...RANKS_UI.flatMap((rank) => { const xc = c.cargo.filter((x) => x.rank === rank), xp = c.personal.filter((x) => x.rank === rank), w = [...xc, ...xp].some(wanted);
      return [h("span", { className: `rk${w ? " want" : ""}`, title: w ? "The checkpoint wants these" : "" }, rank), h("span", { className: `cell${w ? " want" : ""}` }, h("i", {}, String(xc.length || "")), tiles(xc)),
              h("span", { className: `cell${w ? " want" : ""}` }, h("i", {}, String(xp.length || "")), tiles(xp))]; }));
  C.replaceChildren(...[h("h2", {}, "Caravan ", h("span", { className: "muted small" }, "hover a tile for the card · gold outline = upgraded · blue row = wanted at the checkpoint")),
    grid,
    h("details", {}, h("summary", { className: "muted" }, "Full card list"),
      h("div", { className: "chips" }, c.cargo.map((x) => h("span", { className: `chip ${wanted(x) ? "ix" : SZARAZ.has(x.rank) ? "" : "rich"}`, title: from(x).replace(/^ · /, "") }, label(x) + (foreign(x) && !SZARAZ.has(x.rank) ? ` (R${x.home})` : "")))),
      h("div", { className: "muted" }, "Personal deck:"), h("div", { className: "chips" }, c.personal.map((x) => h("span", { className: `chip ${x.refined || x.adjective ? "ix" : ""}` }, label(x))))),
    (() => { const un = [...c.cargo, ...c.personal].filter((x) => unbuiltAbilities(x).length);
      return un.length ? h("details", {}, h("summary", { className: "warn small" }, `⚠ ${new Set(un.map(cardName)).size} card${un.length === 1 ? "" : "s"} with abilities not yet working`),
        h("div", { className: "warn small" }, [...new Set(un.map((x) => `${cardName(x)}: ${unbuiltAbilities(x).join("; ")}`))].join(" · "))) : null; })()].filter(Boolean));

  const L = document.getElementById("log");
  L.replaceChildren(...state.log.slice().reverse().map((e) => h("li", { className: e.kind }, `R${e.round}: ${e.text}`)));
  drawOverlay(opts);
  drawWorld();
  growlToasts();
  if (!REFS) for (const id of ["here", "actions", "caravan", "log", "growls"]) stripRefs(document.getElementById(id));
  if (lastAt !== c.at) { lastAt = c.at; const [x, y] = px(here.cell), m = document.getElementById("map"), r = svg.getBoundingClientRect(), sc = r.width / (board.W * board.map.cell + 8);
    m.scrollTo({ top: Math.max(0, (y - board.map.top) * sc - m.clientHeight / 2), behavior: "smooth" }); }
}
let lastAt = null;
const folded = new Set(["Church"]);   // service sections folded away (the Church lists every card, so it starts folded)
// keys: 1-9 choose a route; Escape closes the help
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { document.getElementById("help").hidden = true; return; }
  if (e.target.closest?.("input, textarea") || !document.getElementById("matchLayer").hidden || !document.getElementById("help").hidden) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 9) { const o = options(state); const mv = o.phase === "declare" && o.moves[k - 1]; if (mv && mv.available) doMove(mv); }
});
// rule references (D-123, RW-01 ...) are for the designers; hidden in play unless &refs=1
const REF = /\s*\((?=[^()]*\b(?:D-\d{3}|RW-\d+|SET-\d+|CHK-\d+|ENC-\d+|CAR-\d+|TRV-\d+|SUS-\d+)\b)[^()]*\)|\s*\[(?:TEMPORARY|DRAFT price)[^\]]*\]/g;
function stripRefs(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (REF.test(n.nodeValue)) { REF.lastIndex = 0; n.nodeValue = n.nodeValue.replace(REF, ""); }
  REF.lastIndex = 0;
}
{ const help = document.getElementById("help"), show = (v) => { help.hidden = !v; };
  document.getElementById("helpBtn").onclick = () => show(true); document.getElementById("helpClose").onclick = () => show(false);
  help.addEventListener("click", (e) => { if (e.target === help) show(false); });       // a click outside the box closes it
  let seen = false; try { seen = localStorage.getItem("fs-help-seen") === "1"; localStorage.setItem("fs-help-seen", "1"); } catch {}
  if (!seen) show(true); }

// ---------------------------------------------------------------- road encounters
const EVENT_TEXT = {
  "travelling peddler": "A small travelling merchant: two base commodities for sale, and he buys commodities (D-678 B4, D-796). Prices as a settlement market.",
  "inn": "A roadside csárda: refined food and drink at a slight markup; it buys base food, drink and livestock below settlement prices (D-807, D-811).",
  "lost traveller": "A lost traveller asks to ride with you to the next settlement. They take one wagon slot until then (not a cargo card) and leave a small thank-you (D-421, D-798).",
  "broken-down caravan": "A stranded caravan asks for help. Give money or a cargo card, or leave. A commodity returns a random upgraded commodity; an Alsó or Felső a random upgraded card of that rank; money a random upgraded card (D-796, D-797).",
  "abandoned wagon": "An abandoned wagon by the road. Search it, or leave it alone. Searching may spring a Bandit ambush (D-804).",
  "travelling craftsman": "",
  "minor checkpoint": "A minor King's Men checkpoint found X or Ász in its spot check. Fight (a cargo ambush against the guards), or surrender the cards found; surrendering after the first check means a second one.",
  "pilgrims": "Pilgrims on the road challenge you to a friendly game: your personal deck against theirs, two tricks, Zsír points decide. Win and they give you an upgraded Clergy card (no X or Ász). Lose: no harm done.",
  "festival": "A festival by the road: the Carnivalfolk challenge you to a friendly game, your personal deck against theirs, two tricks, Zsír points decide. Win a commodity X. Lose: no harm done.",
  "King's Men patrol": "",
  "dubious toll collectors": "",
  "travelling mercenaries": "Mercenaries on the road, at a discount: hire one, or upgrade the one you have; or decline (D-806). Prices provisional.",
};
const ACTION_LABEL = (x, o) => ({
  leave: ["lost traveller", "pilgrims", "festival"].includes(o.event.name) ? "Decline" : "Move on",
  buy: `Buy ${x.card && label(x.card)} · ${x.price} coins`, sell: `Sell ${x.card && label(x.card)} → ${x.price}`,
  help: "Help them (a Zsír match)", "road-hire": `Hire ${x.card && x.card.name} · ${x.price} coins (${x.card && x.card.note})`, "road-merc-upgrade": `${x.card && x.card.name} → ${x.next} · ${x.price} coins`, "take-passenger": "Take the passenger", "give-money": `Give ${x.amount} coins`,
  "give-card": `Give ${x.card && label(x.card)}`, search: "Search the wagon", "pay-toll": `Pay the toll (${x.amount} coins)`,
  "spot-check": "Submit to a 2-card spot check", friendly: "Play the friendly match",
  craft: `Refine ${x.card && label(x.card)} → ${x.to} (free)`, "mc-fight": "Fight the guards", "mc-surrender": "Surrender the cards found", refuse: "Refuse both (they attack)", confront: "Confront them anyway (you ambush them)",
}[x.type]);
// the scoreboard (D-952, D-953): your six score components (D-416; weights provisional), then every caravan's total, ranked
let scoreboardShown = null;
function showScoreboard(ended) {
  document.getElementById("scoreboard")?.remove();
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const rows = [{ name: "You", civ: CIV, st: state }, ...world.ais.map((ai) => ({ name: cap(ai.ai.name.replace(/^the /i, "").replace(/['’]s? caravan$/i, "")), civ: ai.ai.civ, st: ai }))]
    .map((r) => ({ ...r, sc: runScore(r.st), status: r.st === state ? (ended.won ? "through" : "out of cards") : r.st.ended ? (r.st.ended.won ? "through" : "out") : "on the road" }))
    .sort((a, b) => b.sc.total - a.sc.total);
  const mine = rows.find((r) => r.st === state);
  const title = ended.final ? "Final scoreboard: the Royal Castle" : ended.won ? `Scoreboard: Region ${board.region} checkpoint passed` : "Scoreboard: out of cards";
  const layer = h("div", { id: "scoreboard", onclick: (e) => { if (e.target === layer) layer.remove(); } },
    h("div", { className: "helpbox hideout" }, h("h2", {}, title),
      h("h3", {}, "Your score"),
      h("table", { className: "sb" }, h("tbody", {}, ...Object.entries(mine.sc.parts).map(([k, v]) => h("tr", {}, h("td", {}, cap(k)), h("td", {}, String(Math.round(v))))),
        h("tr", { className: "tot" }, h("td", {}, "Total"), h("td", {}, String(mine.sc.total))))),
      h("h3", {}, "Standings"),
      h("table", { className: "sb" }, h("tbody", {}, ...rows.map((r, k) => h("tr", { className: r.st === state ? "me" : "" },
        h("td", {}, `${k + 1}. ${r.name}`, h("span", { className: "muted small" }, ` · ${r.civ} · ${r.status}`)), h("td", {}, String(r.sc.total)))))),
      h("p", { className: "muted small" }, "Score weights are provisional (D-416). Caravans knocked out keep the score they had."),
      h("button", { className: "primary", onclick: () => layer.remove() }, "Continue")));
  document.body.append(layer);
}
function renderEvent(A, o) {
  const ev = o.event;
  let text = EVENT_TEXT[ev.name];
  if (ev.name === "King's Men patrol" && ev.mode === "inspect") text = "A King's Men patrol found X or Ász in its spot check. Fight (a cargo ambush against the patrol), or surrender the cards found; surrendering after the first check brings a second (D-803, D-923).";
  else if (ev.name === "King's Men patrol") text = ev.mode === "help"
    ? `A King's Men patrol. Your military (${military(state.caravan)}) impresses them: they ask for help against bandits nearby, a standard Zsír match with King's Men, Bandits and local cards (D-803).`
    : `A King's Men patrol. At average military (2) they don't inspect you and offer standard military commodities (D-803).`;
  if (ev.name === "travelling craftsman") text = `A travelling ${ev.suit} craftsman offers to refine one of your ${ev.suit} cards by one stage, free (D-796, D-882).`;
  if (ev.name === "dubious toll collectors") text = ev.backOff
    ? `Corrupt King's Men demanding a toll. Your military (${military(state.caravan)}) is higher than theirs, so they back off, though you may still confront them (D-801).`
    : `Corrupt King's Men demanding a toll. Pay it, or submit to a 2-card search: any X or Ász found means a fight. Refusing both means a fight (D-809). Toll amount provisional.`;
  A.append(h("h2", {}, ev.name[0].toUpperCase() + ev.name.slice(1)), h("p", {}, text),
    h("div", { className: "muted" }, `Free wagon slots: ${o.slotsFree}`));
  const groups = [["road-hire", "road-merc-upgrade", "mc-fight", "mc-surrender", "craft", "friendly", "buy", "help", "take-passenger", "give-money", "search", "pay-toll", "spot-check", "refuse", "confront"], ["sell", "give-card"], ["leave"]];
  for (const types of groups) {
    const xs = o.actions.filter((x) => types.includes(x.type));
    if (!xs.length) continue;
    const small = types.includes("sell");
    const box = small ? h("div", { className: "chips" }) : A;
    for (const x of xs) box.append(h("button", { className: `${small ? "chip" : ""} ${x.type === "leave" ? "primary" : ""}`, style: small ? "width:auto" : "", disabled: x.allowed === false,
      onclick: () => { if (x.endsRun && !confirm(`This drops your cargo below ${RULES.cargoMinimum} cards: the run will END. Continue?`)) return; act(state, x.i === undefined ? { type: x.type } : { type: x.type, i: x.i }); render(); } },
      small ? `${label(x.card)}${x.type === "sell" ? ` → ${x.price}` : ""}` : ACTION_LABEL(x, o)));
    if (small) A.append(h("div", { className: "muted" }, xs.some((x) => x.type === "sell") ? "Sell:" : "Give:"), box);
  }
}

function growlToasts() {
  const box = document.getElementById("growls") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "growls" }));
  for (const e of state.log.slice(growlsSeen)) if (e.kind === "growl") {
    const t = h("div", { className: "growl" }, e.text); box.append(t); setTimeout(() => t.remove(), 4500);
  }
  growlsSeen = state.log.length;
}

render();
window.__game = { get state() { return state; }, act: (a) => { act(state, a); render(); }, options: () => options(state) };   // test hook
