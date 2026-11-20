// Online multiplayer, the network side (D-955, D-956): the host's browser runs the authoritative game; guests connect browser to
// browser (WebRTC through PeerJS, introduced by its free public matchmaking server) with a room code. The host checks every move
// by applying it to its own world first; only accepted moves go out, numbered, to everyone, who apply them in order and compare
// the host's checksum. A guest that joins or rejoins gets the whole game so far (the start, every move, every region) and replays
// it; a guest whose checksum ever differs reloads and rejoins. World generation stays on the host's machine (serve.py, D-708).
import { newMultiWorld, apply, applyRegion, regionDone, crossing } from "../sim/multi.js";
import { checksum } from "../sim/checksum.js";

const PEERJS = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
const PREFIX = "fatstacks-v1-";
export const ONLINE_CIVS = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk"];   // the original four (D-161); one caravan each

function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = PEERJS; s.onload = () => ok(window.Peer); s.onerror = () => no(new Error("couldn't load the connection library")); document.head.append(s); });
}
const code5 = () => Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

/** a full-screen panel for the lobby and connection messages */
function panel() {
  let el = document.getElementById("netScreen");
  if (!el) { el = document.createElement("div"); el.id = "netScreen"; document.body.append(el); }
  return (...nodes) => { const box = document.createElement("div"); box.className = "helpbox"; box.append(...nodes); el.replaceChildren(box); el.hidden = false; };
}
const tag = (t, text, cls) => { const e = document.createElement(t); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
export function hideNet() { const el = document.getElementById("netScreen"); if (el) el.hidden = true; }

/**
 * Host or join. Resolves when the game starts, with { seat, humans, net } where net offers:
 *   world()            the current world
 *   send(entry)        propose a move (the host checks it; guests send it to the host)
 *   onChange(fn)       fn(kind) after each applied move or region, and on errors
 *   files              the region data the host sent (name -> text)
 * opts: { mode: "host" | "join", code, civ, name, gameMode, generate: async () => worldNumber, fetchRegion: async (world, n) => files }
 */
export async function online(opts) {
  const show = panel();
  show(tag("h2", "Connecting…"), tag("p", "Opening a connection for the online game.", "muted"));
  const Peer = await loadPeer();
  return opts.mode === "host" ? host(Peer, opts, show) : guest(Peer, opts, show);
}

// ================================================================ the host
async function host(Peer, opts, show) {
  const code = (opts.code || code5()).toUpperCase();
  const peer = new Peer(PREFIX + code);
  await new Promise((ok, no) => { peer.on("open", ok); peer.on("error", (e) => no(new Error(e.type === "unavailable-id" ? "that room code is taken; try again" : e.message || e.type))); });
  const humans = [{ civ: opts.civ, name: opts.name || "Host" }], conns = [];   // conns[seat] (seat 0 is the host)
  let started = null, world = null, listeners = [], history = [], startResolve;
  const files = {};
  const broadcast = (msg) => { for (const c of conns) if (c && c.open) c.send(msg); };
  const lobby = () => {
    broadcast({ t: "lobby", humans, code });
    const list = tag("ul"); humans.forEach((p, k) => list.append(tag("li", `${p.name} · ${p.civ}${k === 0 ? " (host)" : conns[k]?.open ? "" : " (disconnected)"}`)));
    const go = tag("button", humans.length < 2 ? "Waiting for at least one more player…" : `Start with ${humans.length} players`, "primary");
    go.disabled = humans.length < 2; go.onclick = () => { go.disabled = true; begin().catch((e) => { beginning = false; show(tag("h2", "Couldn't start"), tag("p", e.message, "bad")); }); };
    show(tag("h2", "Online game · you're hosting"), tag("p", "Room code:", "muted"), tag("div", code, "roomcode"),
      tag("p", "Other players open Fat Stacks, choose “Join an online game” in the hideout, and enter this code. Keep this tab open: your browser runs the game.", "muted small"),
      tag("h3", `Players (${humans.length} of 4)`), list,
      tag("p", "Empty seats are filled by AI caravans. No two players share a civilisation.", "muted small"), go);
  };
  peer.on("connection", (c) => {
    c.on("data", (msg) => onGuest(c, msg));
    // a guest leaving: before the start, the lobby updates; after it, the seat waits for a rejoin and the game screen stays (the
    // lobby, with its Start button, must never come back over a running game)
    c.on("close", () => { const k = conns.indexOf(c); if (k > 0) { conns[k] = null; if (!started) { humans.splice(k, 1); conns.splice(k, 1); lobby(); } notify("left"); } });
  });
  function onGuest(c, msg) {
    if (msg.t === "hello") {
      // a rejoin (same name) takes its seat back and gets the game so far
      const back = started ? humans.findIndex((p, k) => k > 0 && p.name === msg.name && !conns[k]?.open) : -1;
      if (started && back < 0) return c.send({ t: "refused", why: "the game has already started" });
      if (back > 0) { conns[back] = c; c.send({ t: "sync", seat: back, start: started, history }); notify("rejoined"); return; }
      if (humans.length >= 4) return c.send({ t: "refused", why: "the room is full (4 players)" });
      if (humans.some((p) => p.name === msg.name)) return c.send({ t: "refused", why: `the name "${msg.name}" is taken in this room` });
      const civ = humans.some((p) => p.civ === msg.civ) ? ONLINE_CIVS.find((x) => !humans.some((p) => p.civ === x)) : msg.civ;
      humans.push({ civ, name: msg.name }); conns[humans.length - 1] = c;
      if (civ !== msg.civ) c.send({ t: "note", text: `${msg.civ} is taken: you play ${civ}.` });
      return started ? undefined : lobby();
    }
    if (msg.t === "move" && started) {
      const seat = conns.indexOf(c); if (seat <= 0) return;
      const r = accept({ ...msg.e, seat });
      if (!r.ok) c.send({ t: "rejected", why: r.why });
    }
  }
  let beginning = false;
  async function begin() {
    if (started || beginning) return;   // one world per game: never generate a second (a double click, a stale lobby)
    beginning = true;
    show(tag("h2", "Generating a new world…"), tag("p", "Your machine builds the world for everyone (about 10 seconds).", "muted"));
    const w = await opts.generate();
    Object.assign(files, await opts.fetchRegion(w, 1));
    started = { seed: 1 + Math.floor(Math.random() * 1e6), mode: opts.gameMode, humans: humans.map((p) => ({ ...p })), world: w, files: { ...files } };
    world = build(started);
    broadcast({ t: "sync", start: started, history: [] });
    conns.forEach((c, k) => c?.open && c.send({ t: "seat", seat: k }));
    startResolve({ seat: 0, humans: started.humans, net });
  }
  function accept(e) {
    try { apply(world, e); } catch (err) { return { ok: false, why: err.message }; }
    const ev = { t: "entry", n: history.length, e, sum: checksum(world) };
    history.push(ev); broadcast(ev); notify("move");
    maybeCross();
    return { ok: true };
  }
  // when every human has finished the region, the next region is fetched (built in the background meanwhile) and sent
  let crossingBusy = false;
  async function maybeCross() {
    if (crossingBusy || !regionDone(world)) return;
    const n = crossing(world); if (!n || n > 8) return;
    crossingBusy = true;
    try {
      const f = await opts.fetchRegion(started.world, n); Object.assign(files, f);
      applyRegion(world, JSON.parse(f[`w${started.world}-r${n}.json`]));
      const ev = { t: "region", n: history.length, region: n, files: f, sum: checksum(world) };
      history.push(ev); broadcast(ev); notify("region");
    } finally { crossingBusy = false; }
  }
  const notify = (kind, info) => { for (const fn of listeners) fn(kind, info); };
  const net = { host: true, code, world: () => world, files, onChange: (fn) => listeners.push(fn), send: (e) => { const r = accept({ ...e, seat: 0 }); if (!r.ok) notify("rejected", r.why); },
    players: () => humans.map((p, k) => ({ ...p, connected: k === 0 || !!conns[k]?.open })) };
  lobby();
  return new Promise((ok) => { startResolve = ok; });
}
function build(start) {
  const board = JSON.parse(start.files[`w${start.world}-r1.json`]);
  return newMultiWorld(board, start.seed, start.mode, start.humans);
}

// ================================================================ a guest
async function guest(Peer, opts, show) {
  const code = (opts.code || "").toUpperCase().trim();
  if (!code) throw new Error("no room code");
  const peer = new Peer();
  await new Promise((ok, no) => { peer.on("open", ok); peer.on("error", (e) => no(new Error(e.message || e.type))); });
  const c = peer.connect(PREFIX + code, { reliable: true });
  let world = null, seat = null, start = null, listeners = [], startResolve, failed;
  const files = {};
  const notify = (kind, info) => { for (const fn of listeners) fn(kind, info); };
  peer.on("error", (e) => { if (e.type === "peer-unavailable") show(tag("h2", "Room not found"), tag("p", `No game is open under the code ${code}. Check the code with the host.`, "bad")); });
  c.on("open", () => { c.send({ t: "hello", name: opts.name, civ: opts.civ }); show(tag("h2", "Joined room " + code), tag("p", "Waiting for the host to start…", "muted")); });
  c.on("close", () => { notify("disconnected"); show(tag("h2", "Connection to the host lost"), tag("p", "The host may have closed the game. Reload to try rejoining.", "bad")); });
  const play = (ev) => {
    if (ev.t === "entry") apply(world, ev.e);
    else if (ev.t === "region") { Object.assign(files, ev.files); applyRegion(world, JSON.parse(ev.files[`w${start.world}-r${ev.region}.json`])); }
    if (ev.sum !== undefined && checksum(world) !== ev.sum) { failed = true; notify("desync"); show(tag("h2", "Out of step with the host"), tag("p", "Rejoining to catch up…", "muted")); setTimeout(() => location.reload(), 800); }
  };
  c.on("data", (msg) => {
    if (msg.t === "lobby") { const list = tag("ul"); msg.humans.forEach((p, k) => list.append(tag("li", `${p.name} · ${p.civ}${k === 0 ? " (host)" : ""}`)));
      if (!start) show(tag("h2", "Joined room " + code), tag("p", "Waiting for the host to start…", "muted"), tag("h3", `Players (${msg.humans.length} of 4)`), list); }
    else if (msg.t === "note") notify("note", msg.text);
    else if (msg.t === "refused") show(tag("h2", "Couldn't join"), tag("p", msg.why, "bad"));
    else if (msg.t === "seat") seat = msg.seat;
    else if (msg.t === "sync") {
      start = msg.start; if (msg.seat != null) seat = msg.seat;
      Object.assign(files, start.files); world = build(start);
      for (const ev of msg.history) { play(ev); if (failed) return; }
      const go = () => { if (seat == null) return setTimeout(go, 50); startResolve({ seat, humans: start.humans, net }); };
      go();
    }
    else if (msg.t === "entry" || msg.t === "region") { if (world && !failed) { play(msg); notify(msg.t === "region" ? "region" : "move"); } }
    else if (msg.t === "rejected") notify("rejected", msg.why);
  });
  const net = { host: false, code, world: () => world, files, onChange: (fn) => listeners.push(fn), send: (e) => c.send({ t: "move", e }), players: () => (start ? start.humans : []) };
  return new Promise((ok) => { startResolve = ok; });
}
