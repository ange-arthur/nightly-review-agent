import { readCsvFile } from "../csv.ts";
import { parseSystemTime, signed } from "../time.ts";
import type { Check, CheckContext, CheckResult, Incident } from "../types.ts";

export interface EquityPoint {
  t: number;
  balance: number;
  equity: number;
  openPositions: number;
}

export function parseEquity(rows: Record<string, string>[]): EquityPoint[] {
  return rows
    .map((r) => ({
      t: parseSystemTime(r["t"] ?? ""),
      balance: Number(r["balance"]),
      equity: Number(r["equity"]),
      openPositions: Number(r["openPositions"] ?? 0),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.balance) && Number.isFinite(p.equity))
    .sort((a, b) => a.t - b.t);
}

/** Day P&L in percent of the opening balance, from the first and last points of the day. */
export function dayPnlPct(points: EquityPoint[]): number | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.balance === 0) return null;
  return (100 * (last.equity - first.balance)) / first.balance;
}

/**
 * Account guard. A loss beyond the warning threshold is an anomaly to investigate (level 2);
 * beyond the blocking threshold the only sane action touches production (pause the system), so
 * it is raised at level 3: prepared, reported, and left to a human GO.
 */
export function pnlCheck(ctx: CheckContext): CheckResult {
  const { config, window } = ctx;
  const incidents: Incident[] = [];
  const lines: string[] = [];
  const table = readCsvFile(ctx.path(config.sources.equity));
  if (!table) {
    incidents.push({ level: 1, check: "pnl", text: `equity file missing: ${config.sources.equity}` });
    return { title: "Account", lines: ["_Account check skipped: source missing._"], incidents };
  }
  const all = parseEquity(table.rows);
  const day = all.filter((p) => p.t >= window.start && p.t < window.end);
  const last = day[day.length - 1] ?? all[all.length - 1];
  if (!last) {
    lines.push("No equity data.");
    return { title: "Account", lines, incidents };
  }
  const pct = dayPnlPct(day);
  lines.push(
    `Balance ${last.balance.toFixed(0)}, equity ${last.equity.toFixed(0)}, floating ${signed(last.equity - last.balance, 0)}, ` +
      `${last.openPositions} open position(s)` +
      (pct === null ? "." : `, day P&L **${signed(pct)} %** (warn ${config.thresholds.dailyLossWarnPct} %, block ${config.thresholds.dailyLossBlockPct} %).`),
  );
  if (pct !== null && pct <= config.thresholds.dailyLossBlockPct) {
    incidents.push({
      level: 3,
      check: "pnl",
      text: `day P&L ${signed(pct)} % breached the blocking threshold (${config.thresholds.dailyLossBlockPct} %): pausing the system is prepared, waiting for human GO`,
    });
  } else if (pct !== null && pct <= config.thresholds.dailyLossWarnPct) {
    incidents.push({ level: 2, check: "pnl", text: `day P&L ${signed(pct)} % below the warning threshold (${config.thresholds.dailyLossWarnPct} %)` });
  }
  return { title: "Account", lines, incidents };
}

export const pnl: Check = { name: "pnl", run: pnlCheck };
