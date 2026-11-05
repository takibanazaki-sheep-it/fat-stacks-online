// The hideout (D-418, D-739, D-740, D-744): visited only between runs, before the first and after each run's summary. Your profile
// keeps Goldbars (every run's score converts, failed runs included), the civilisations you've unlocked (the original four from the
// start), permanent upgrades (capture quality) and the titles you've unlocked by buying adjectives during runs (cosmetic; one
// equipped or none). Prices and the conversion rate are PLACEHOLDERS (rules.js, PLACEHOLDER.hideout).
import { PLACEHOLDER } from "../sim/rules.js";
import { entry as upgradeEntry } from "../sim/upgrades.js";

export const ALL_CIVS = ["Farmfolk", "Clergy", "Forestfolk", "Tradesfolk", "Hillfolk", "Carnivalfolk", "Fisherfolk", "Plainsfolk", "Townsfolk", "Bandits", "Beasts", "King's Men"];
const START = ALL_CIVS.slice(0, 4);
const KEY = "fs-profile";
const H = PLACEHOLDER.hideout;

export function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { p = null; }
  p = p && typeof p === "object" ? p : {};
  return { goldbars: p.goldbars || 0, unlocked: [...new Set([...START, ...(p.unlocked || [])])], capture: p.capture || 0,
           titles: p.titles || [], title: p.title || null, runs: p.runs || 0, awarded: p.awarded || [] };
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: the profile lasts this page only */ } }
export const captureBonus = (p) => (p.capture || 0) * H.capture.step;

/** after a run's summary: its score becomes Goldbars, once per run (D-418); titles unlocked in the run are kept (D-744) */
export function awardRun(p, runKey, score, titles) {
  for (const t of titles || []) if (!p.titles.includes(t)) p.titles.push(t);
  if (p.awarded.includes(runKey)) { saveProfile(p); return 0; }
  const gb = Math.max(0, Math.floor(score * H.goldbarsPerPoint));
  p.goldbars += gb; p.runs += 1; p.awarded = [...p.awarded.slice(-49), runKey]; saveProfile(p);
  return gb;
}

/** the hideout screen; onStart(civ, online) begins a run: online is null (solo) or { mode: "host" | "join", name, code } (D-957) */
// solo and hosting need the world generator, which runs on your own machine (serve.py); the public copy of the game can only join
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
let how = { mode: LOCAL ? "solo" : "join", name: "", code: "" };
try { how = { ...how, ...JSON.parse(localStorage.getItem("fs-online") || "{}"), mode: LOCAL ? "solo" : "join" }; } catch { /* keep the defaults */ }
export function openHideout(h, p, onStart, note = "") {
  document.getElementById("hideout")?.remove();
  const layer = h("div", { id: "hideout" });
  const remember = () => { try { localStorage.setItem("fs-online", JSON.stringify({ name: how.name, code: how.code })); } catch { /* private window */ } };
  const start = (civ) => {
    if (how.mode === "solo") return onStart(civ, null);
    if (!how.name.trim()) return alert("Enter a name for the online game.");
    if (how.mode === "join" && !/^[A-Z0-9]{5}$/i.test(how.code.trim())) return alert("Enter the host's five-character room code.");
    remember(); onStart(civ, { mode: how.mode, name: how.name.trim(), code: how.code.trim() });
  };
  const draw = () => {
    const box = h("div", { className: "helpbox hideout" },
      h("h2", {}, "The Hideout"),
      h("div", { className: "hstat" }, h("span", { className: "gold" }, `${p.goldbars} Goldbars`), h("span", { className: "muted" }, ` · ${p.runs} run${p.runs === 1 ? "" : "s"} so far`), p.title ? h("span", { className: "muted" }, ` · title: the ${p.title}`) : null),
      note ? h("p", { className: "good" }, note) : null,
      h("h3", {}, "How to play"),
      h("div", { className: "chips" }, ...[["solo", "Solo"], ["host", "Host an online game"], ["join", "Join an online game"]].map(([k, t]) =>
        h("button", { className: `chip${how.mode === k ? " sel" : ""}`, disabled: !LOCAL && k !== "join", onclick: () => { how.mode = k; draw(); } }, t))),
      LOCAL ? null : h("p", { className: "muted small" }, "This copy of the game can join online games. To play solo or host, run Fat Stacks on your own machine (serve.py)."),
      how.mode === "solo" ? null : h("div", { className: "online" },
        h("label", {}, "Your name ", h("input", { value: how.name, maxLength: 20, oninput: (e) => { how.name = e.target.value; } })),
        how.mode === "join" ? h("label", {}, " Room code ", h("input", { value: how.code, maxLength: 5, style: "text-transform:uppercase;width:6em", oninput: (e) => { how.code = e.target.value; } })) : null,
        h("p", { className: "muted small" }, how.mode === "host"
          ? "You host: your machine generates the world and your browser runs the game, so keep the tab open. You'll get a room code to give the others (2 to 4 players; AI caravans fill the empty seats)."
          : "Ask the host for their room code. Two players can't play the same civilisation.")),
      h("h3", {}, how.mode === "solo" ? "Choose your civilisation" : "Choose your civilisation, then the game opens"),
      h("p", { className: "muted small" }, "You start with two full sets of your suit's cards (cargo and personal deck), your papers fully upgraded. Three of the original four travel the road as rival caravans."),
      h("div", { className: "civgrid" }, ...ALL_CIVS.map((civ) => {
        const e = upgradeEntry({ rank: "IX", suit: civ }), open = p.unlocked.includes(civ);
        const desc = e ? `${e.adjective} ${e.stages[1]}: ${e.refine.gives[0].replace(/^[^:]+: /, "").replace(/\s*\[[^\]]*\]/g, "")}` : "";
        return h("button", { className: `group civ${open ? "" : " locked"}`, disabled: !open && p.goldbars < H.unlockPrice, title: desc,
          onclick: () => { if (open) return start(civ);
            if (!confirm(`Unlock ${civ} for ${H.unlockPrice} Goldbars?`)) return;
            p.goldbars -= H.unlockPrice; p.unlocked.push(civ); saveProfile(p); draw(); } },
          h("b", {}, civ), h("div", { className: "muted small" }, open ? desc : `Locked · unlock for ${H.unlockPrice} Goldbars`)); })),
      h("h3", {}, "Permanent upgrades"),
      (() => { const lvl = p.capture, next = H.capture.prices[lvl];
        return h("div", { className: "upgrow" }, h("div", {}, h("b", {}, "Keen-eyed Appraisers"), h("div", { className: "muted small" },
            `Captured upgraded cards arrive as exact copies more often: +${Math.round(H.capture.step * 100)}% a level (now level ${lvl}, +${Math.round(lvl * H.capture.step * 100)}%).`)),
          next == null ? h("span", { className: "muted small" }, "fully upgraded")
            : h("button", { className: "chip", disabled: p.goldbars < next, onclick: () => { p.goldbars -= next; p.capture += 1; saveProfile(p); draw(); } }, `Level ${lvl + 1} · ${next} Goldbars`)); })(),
      h("h3", {}, "Titles"),
      p.titles.length ? h("div", { className: "chips" }, h("button", { className: `chip${!p.title ? " sel" : ""}`, onclick: () => { p.title = null; saveProfile(p); draw(); } }, "none"),
          ...p.titles.map((t) => h("button", { className: `chip${p.title === t ? " sel" : ""}`, onclick: () => { p.title = t; saveProfile(p); draw(); } }, `the ${t}`)))
        : h("p", { className: "muted small" }, "None yet. Buying an adjective for a card during a run unlocks it as a title."),
      h("p", { className: "muted small" }, "Goldbars come from every run's final score, failed runs included. Prices are provisional."));
    layer.replaceChildren(box);
  };
  draw(); document.body.append(layer);
}
