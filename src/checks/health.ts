import { fileAgeMinutes, readCsvFile } from "../csv.ts";
import { hhmm, parseSystemTime, weekday } from "../time.ts";
import type { Check, CheckContext, CheckResult, Incident } from "../types.ts";

export interface Heartbeat {
  t: number;
  ok: boolean;
  note: string;
}

export function parseHeartbeats(rows: Record<string, string>[]): Heartbeat[] {
  return rows
    .map((r) => ({ t: parseSystemTime(r["t"] ?? ""), ok: (r["ok"] ?? "1") !== "0", note: r["note"] ?? "" }))
    .filter((h) => Number.isFinite(h.t))
    .sort((a, b) => a.t - b.t);
}

/** Largest gap between consecutive heartbeats, in minutes (0 when fewer than two beats). */
export function largestGapMinutes(beats: Heartbeat[]): { gap: number; at: number } {
  let gap = 0;
  let at = 0;
  for (let i = 1; i < beats.length; i++) {
    const g = (beats[i]!.t - beats[i - 1]!.t) / 60_000;
    if (g > gap) {
      gap = g;
      at = beats[i - 1]!.t;
    }
  }
  return { gap, at };
}

export function isMarketOpen(nowMs: number, closedWeekdays: number[]): boolean {
  return !closedWeekdays.includes(weekday(nowMs));
}

export function healthCheck(ctx: CheckContext): CheckResult {
  const { config, window } = ctx;
  const incidents: Incident[] = [];
  const lines: string[] = [];

  // 1. Heartbeat of the supervisor.
  const hbTable = readCsvFile(ctx.path(config.sources.heartbeat));
  if (!hbTable) {
    incidents.push({ level: 1, check: "health", text: `heartbeat file missing: ${config.sources.heartbeat}` });
    lines.push("- Heartbeat: _file missing_.");
  } else {
    const beats = parseHeartbeats(hbTable.rows).filter((b) => b.t >= window.start && b.t < window.end);
    const failures = beats.filter((b) => !b.ok);
    const { gap, at } = largestGapMinutes(beats);
    lines.push(
      `- Heartbeat: ${beats.length} check(s), ${failures.length} failure(s), largest gap ${gap.toFixed(0)} min` +
        (gap > 0 ? ` (after ${hhmm(at)})` : "") +
        ".",
    );
    if (failures.length) {
      incidents.push({
        level: 2,
        check: "health",
        text: `heartbeat reported ${failures.length} failure(s) (first at ${hhmm(failures[0]!.t)}${failures[0]!.note ? `: ${failures[0]!.note}` : ""})`,
      });
    }
    if (beats.length && gap > config.health.maxHeartbeatGapMinutes) {
      incidents.push({
        level: 2,
        check: "health",
        text: `heartbeat gap of ${gap.toFixed(0)} min after ${hhmm(at)} (machine asleep or supervisor stopped?)`,
      });
    }
  }

  // 2. Freshness of the per-symbol state exports, only while the market is open.
  const open = isMarketOpen(ctx.nowMs, config.health.closedWeekdays);
  const stale: string[] = [];
  const absent: string[] = [];
  for (const symbol of config.symbols) {
    const file = config.sources.statePattern.replace("{symbol}", symbol);
    const age = fileAgeMinutes(ctx.path(file), ctx.nowMs);
    if (age === null) absent.push(symbol);
    else if (age > config.health.maxStateAgeMinutes) stale.push(`${symbol} (${age.toFixed(0)} min)`);
  }
  lines.push(
    `- State exports: ` +
      (absent.length ? `missing for ${absent.join(", ")}; ` : "") +
      (stale.length ? `**stale**: ${stale.join(", ")}` : "all fresh") +
      (open ? "" : " (market closed: freshness not required)") +
      ".",
  );
  if (absent.length) incidents.push({ level: 2, check: "health", text: `no state export for ${absent.join(", ")}` });
  if (open && stale.length) {
    incidents.push({
      level: 2,
      check: "health",
      text: `state exports stale while the market is open: ${stale.join(", ")} — check that the system is attached and running`,
    });
  }
  return { title: "Health", lines, incidents };
}

export const health: Check = { name: "health", run: healthCheck };
