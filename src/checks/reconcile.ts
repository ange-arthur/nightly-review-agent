import { readCsvFile } from "../csv.ts";
import { hhmm, parseSystemTime, signed } from "../time.ts";
import type { Check, CheckContext, CheckResult, Incident } from "../types.ts";

export interface Event {
  t: number;
  symbol: string;
  dir: 1 | -1;
  result: number;
  id: string;
}

export interface MatchOutcome {
  matched: Array<{ expected: Event; actual: Event }>;
  missing: Event[];
  extra: Event[];
}

export function parseEvents(rows: Record<string, string>[]): Event[] {
  return rows
    .map((r, i) => ({
      t: parseSystemTime(r["t"] ?? ""),
      symbol: (r["symbol"] ?? "").trim(),
      dir: (Number(r["dir"]) >= 0 ? 1 : -1) as 1 | -1,
      result: Number(r["result"]),
      id: r["id"] && r["id"].length > 0 ? r["id"] : String(i + 1),
    }))
    .filter((e) => Number.isFinite(e.t) && e.symbol.length > 0);
}

export function inWindow<T extends { t: number }>(events: T[], start: number, end: number): T[] {
  return events.filter((e) => e.t >= start && e.t < end);
}

/**
 * Greedy nearest-neighbour matching: each expected event is paired with the closest unmatched
 * actual event of the same symbol and direction within the tolerance. Deterministic and
 * order-independent for non-overlapping candidates, which is what reconciliation needs.
 */
export function matchEvents(expected: Event[], actual: Event[], toleranceMinutes: number): MatchOutcome {
  const tol = toleranceMinutes * 60_000;
  const used = new Set<number>();
  const matched: MatchOutcome["matched"] = [];
  const missing: Event[] = [];
  for (const e of [...expected].sort((a, b) => a.t - b.t)) {
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    actual.forEach((a, i) => {
      if (used.has(i) || a.symbol !== e.symbol || a.dir !== e.dir) return;
      const d = Math.abs(a.t - e.t);
      if (d <= tol && d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best >= 0) {
      used.add(best);
      matched.push({ expected: e, actual: actual[best]! });
    } else {
      missing.push(e);
    }
  }
  const extra = actual.filter((_, i) => !used.has(i));
  return { matched, missing, extra };
}

export function reconcileCheck(ctx: CheckContext): CheckResult {
  const { config, window } = ctx;
  const incidents: Incident[] = [];
  const lines: string[] = [];
  const expTable = readCsvFile(ctx.path(config.sources.expected));
  const actTable = readCsvFile(ctx.path(config.sources.actual));
  if (!expTable || !actTable) {
    const missingFiles = [!expTable && config.sources.expected, !actTable && config.sources.actual].filter(Boolean);
    incidents.push({ level: 1, check: "reconcile", text: `source file(s) missing: ${missingFiles.join(", ")}` });
    return { title: "Expected vs actual", lines: ["_Reconciliation skipped: source missing._"], incidents };
  }
  const expected = inWindow(parseEvents(expTable.rows), window.start, window.end);
  const actual = inWindow(parseEvents(actTable.rows), window.start, window.end);
  const { matched, missing, extra } = matchEvents(expected, actual, config.reconcile.toleranceMinutes);

  const sum = (xs: Event[]) => xs.reduce((s, e) => s + e.result, 0);
  lines.push(
    `Expected ${expected.length} event(s) (${signed(sum(expected))}), actual ${actual.length} (${signed(sum(actual))}), ` +
      `matched ${matched.length}, missing ${missing.length}, extra ${extra.length}, tolerance ±${config.reconcile.toleranceMinutes} min.`,
  );
  if (matched.length) {
    lines.push("", "| expected | actual | symbol | dir | exp. result | act. result | gap |", "|---|---|---|---|---|---|---|");
    for (const { expected: e, actual: a } of matched) {
      const gap = a.result - e.result;
      lines.push(
        `| ${hhmm(e.t)} | ${hhmm(a.t)} | ${e.symbol} | ${e.dir > 0 ? "buy" : "sell"} | ${signed(e.result)} | ${signed(a.result)} | ${signed(gap)} |`,
      );
      if (Math.abs(gap) > config.reconcile.maxResultDivergence) {
        incidents.push({
          level: 2,
          check: "reconcile",
          text: `${e.symbol} ${hhmm(e.t)}: result diverges from reference (${signed(a.result)} vs ${signed(e.result)})`,
        });
      }
    }
  }
  for (const e of missing) {
    lines.push(`- Missing: ${e.symbol} ${e.dir > 0 ? "buy" : "sell"} expected at ${hhmm(e.t)} (${signed(e.result)}) was not executed.`);
    incidents.push({ level: 2, check: "reconcile", text: `expected event not executed: ${e.symbol} ${hhmm(e.t)}` });
  }
  for (const a of extra) {
    lines.push(`- Extra: ${a.symbol} ${a.dir > 0 ? "buy" : "sell"} executed at ${hhmm(a.t)} (${signed(a.result)}) without a reference event.`);
    incidents.push({ level: 2, check: "reconcile", text: `event executed without reference: ${a.symbol} ${hhmm(a.t)} #${a.id}` });
  }
  const agreement = expected.length ? Math.round((100 * matched.length) / expected.length) : 100;
  lines.push("", `Agreement with the reference model: **${agreement} %**.`);
  return { title: "Expected vs actual", lines, incidents };
}

export const reconcile: Check = { name: "reconcile", run: reconcileCheck };
