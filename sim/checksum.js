// A checksum of the whole run's state (D-956): every client of an online game replays the host's accepted moves from the same
// seed, and compares this after each move to catch any divergence. It walks the caravans' states (yours, the other humans',
// the AI caravans'), skipping the static region data and functions; random-number generators count by their position.
const SKIP = new Set(["board", "stops", "legsFrom", "world", "joiners", "log"]);

export function checksum(world) {
  let h = 0x811c9dc5;
  const put = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  const seen = new Map();
  const walk = (v) => {
    if (v === null || v === undefined) return put("_");
    const t = typeof v;
    if (t === "number" || t === "boolean" || t === "string") return put(t[0] + String(v) + ";");
    if (t === "function") return;
    if (seen.has(v)) return put("@" + seen.get(v));
    seen.set(v, seen.size);
    if (typeof v.next === "function" && typeof v.state === "function") return put("r" + v.state());   // a seeded rng: its position
    if (v instanceof Set) { put("S"); for (const x of v) walk(x); return put("}"); }
    if (v instanceof Map) { put("M"); for (const [k, x] of v) { walk(k); walk(x); } return put("}"); }
    if (Array.isArray(v)) { put("["); for (const x of v) walk(x); return put("]"); }
    put("{");
    for (const k of Object.keys(v)) { if (SKIP.has(k)) { if (k === "log") put("L" + v.log.length); continue; } put(k + ":"); walk(v[k]); }
    put("}");
  };
  for (const st of [...(world.humans || [world.player]), ...world.ais]) walk(st);
  walk(world.rng); if (!world.multi) walk(world.meet ?? null);   // online, each human's meeting is in their own state
  return h;
}
