// Seeded random numbers so every run can be replayed exactly (mulberry32).
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (items, weightOf) => {
      const total = items.reduce((a, x) => a + weightOf(x), 0);
      let r = next() * total;
      for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
      return items[items.length - 1];
    },
    state: () => s,
  };
}
