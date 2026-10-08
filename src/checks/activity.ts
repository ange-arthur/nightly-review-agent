import { readCsvFile } from "../csv.ts";
import { hhmm, signed } from "../time.ts";
import type { Check, CheckContext, CheckResult, Incident } from "../types.ts";
import { inWindow, parseEvents } from "./reconcile.ts";

/** What the system actually did today, before any judgement: the section a human reads first. */
export function activityCheck(ctx: CheckContext): CheckResult {
  const { config, window } = ctx;
  const incidents: Incident[] = [];
  const table = readCsvFile(ctx.path(config.sources.actual));
  if (!table) {
    incidents.push({ level: 1, check: "activity", text: `actual events file missing: ${config.sources.actual}` });
    return { title: "Activity of the day", lines: ["_No activity data._"], incidents };
  }
  const events = inWindow(parseEvents(table.rows), window.start, window.end);
  const total = events.reduce((s, e) => s + e.result, 0);
  const lines = [`${events.length} event(s), total ${signed(total)}.`];
  if (events.length) {
    lines.push("", "| time | symbol | dir | result | id |", "|---|---|---|---|---|");
    for (const e of events) lines.push(`| ${hhmm(e.t)} | ${e.symbol} | ${e.dir > 0 ? "buy" : "sell"} | ${signed(e.result)} | ${e.id} |`);
    const bySymbol = new Map<string, { n: number; sum: number }>();
    for (const e of events) {
      const cur = bySymbol.get(e.symbol) ?? { n: 0, sum: 0 };
      bySymbol.set(e.symbol, { n: cur.n + 1, sum: cur.sum + e.result });
    }
    lines.push("", "Per symbol: " + [...bySymbol].map(([s, v]) => `${s} ${v.n}× ${signed(v.sum)}`).join(", ") + ".");
  }
  return { title: "Activity of the day", lines, incidents };
}

export const activity: Check = { name: "activity", run: activityCheck };
