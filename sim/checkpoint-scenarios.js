// Checkpoint requirement scenarios (D-875; categories D-428; regional D-413, D-429; achievable in the region D-427).
// Counted across cargo and personal deck (D-735). All quantities are PLACEHOLDERS. Rank scenarios ask for 6 (D-879): a
// Region 1 journey has only a few matches, and you start with 2 of each rank.
// Region 1 draws from the standard tier; "exports" is the harder tier for later regions (D-429), reachable for testing
// with ?req=exports. A specific scenario can be forced with ?req=<id>.
import { COMMODITY_STAGES } from "./commodity-data.js";
import { lineOf } from "./encounters.js";


// Scaling across the run (CHK-03, a balance value; schedule approved as a placeholder 2026-11-05): Regions 1-3 draw the
// standard tier, from Region 4 Exports join the draw; every count rises by 1 each two regions; the Royal Castle asks one more.
export const PROGRESSION = { exportsFrom: 4, countStep: 2, finalExtra: 1, tollBase: 40, tollStep: 10 };   // PLACEHOLDERS
const extra = (ctx) => Math.floor(((ctx.region || 1) - 1) / PROGRESSION.countStep) + (ctx.final ? PROGRESSION.finalExtra : 0);

export const SCENARIOS = {
  border:      { tier: 1, make: (ctx, n = 6 + extra(ctx)) => ({ title: "Increased border security", ask: `${n} Rank IX (travel documents)`, short: "Rank IX", count: n, test: (c) => c.rank === "IX" }) },
  settlers:    { tier: 1, make: (ctx, n = 6 + extra(ctx)) => ({ title: "Settlers needed", ask: `${n} Alsó`, short: "Alsó", count: n, test: (c) => c.rank === "Alsó" }) },
  specialists: { tier: 1, make: (ctx, n = 6 + extra(ctx)) => ({ title: "Specialists needed", ask: `${n} Felső`, short: "Felső", count: n, test: (c) => c.rank === "Felső" }) },
  leaders:     { tier: 1, make: (ctx, n = 6 + extra(ctx)) => ({ title: "Leaders needed", ask: `${n} Király`, short: "Király", count: n, test: (c) => c.rank === "Király" }) },
  // a suit present in the region; never the caravan's own civilisation, whose 16 starting cards would meet it at once
  suit:        { tier: 1, make: (ctx, n = 4 + extra(ctx)) => { const suit = ctx.rng.pick(ctx.regionSuits.filter((s) => s !== ctx.civilisation));
                   return { title: `${suit} goods wanted`, ask: `${n} ${suit} cards`, short: suit, count: n, test: (c) => c.suit === suit }; } },
  // a toll (your ruling 2026-11-05, D-947): the guards want coins, not cards; 40 in Region 1, +10 a scaling step (placeholder);
  // paid on passing; not cargo, so Expedited Inspection can't bypass it
  toll:        { tier: 1, make: (ctx, n = PROGRESSION.tollBase + PROGRESSION.tollStep * extra(ctx)) => ({ kind: "toll", title: "Toll demanded", ask: `a toll of ${n} coins`, short: "Toll", count: n, test: () => false }) },
  // Exports (your ruling 2026-11-05, D-935; replaces D-934's 2 of one line): 2 each of the region's TWO most abundant Rank VIII
  // commodity lines, counted over every market's stock on entering the region (ties at random); any stage of a line counts
  // (D-876). The regional scaling adds to the two lines in turn. Falls back to the market suits' lines if stock is empty
  exports:     { tier: 2, make: (ctx) => {
                   const tally = new Map();
                   for (const m of ctx.markets || []) for (const c of m.stock || []) if (c.rank === "VIII" && lineOf(c)) { const k = `${lineOf(c)}|${c.suit}`; tally.set(k, (tally.get(k) || 0) + 1); }
                   let keys = [...tally.entries()].sort((a, b) => b[1] - a[1] || ctx.rng.next() - 0.5).map(([k]) => k);
                   if (keys.length < 2) { const bases = COMMODITY_STAGES.filter((s) => ctx.marketSuits.includes(s.suit) && s.rank === "VIII" && s.stage === 0 && s.roster !== "secret alternative");
                     while (keys.length < 2 && bases.length) { const b = bases.splice(Math.floor(ctx.rng.next() * bases.length), 1)[0]; const k = `${b.name}|${b.suit}`; if (!keys.includes(k)) keys.push(k); } }
                   const e = extra(ctx), parts = keys.slice(0, 2).map((k, i) => { const [name, suit] = k.split("|"); const n = 2 + Math.ceil((e - i) / 2);
                     return { name, suit, count: Math.max(2, n), test: (c) => lineOf(c) === name && c.suit === suit }; });
                   const count = parts.reduce((a, p) => a + p.count, 0);
                   return { title: "Exports needed", ask: parts.map((p) => `${p.count} ${p.name} (${p.suit} VIII)`).join(" and "), short: "Exports", count, parts,
                            test: (c) => parts.some((p) => p.test(c)) }; } },
};

export function drawScenario(ctx, forced) {
  const maxTier = ctx.tier ?? ((ctx.region || 1) >= PROGRESSION.exportsFrom ? 2 : 1);
  const id = forced && SCENARIOS[forced] ? forced : ctx.rng.pick(Object.keys(SCENARIOS).filter((k) => SCENARIOS[k].tier <= maxTier && (ctx.tier == null || SCENARIOS[k].tier === ctx.tier)));
  return { id, ...SCENARIOS[id].make(ctx) };
}
