import { readCsvFile } from "../csv.ts";
import { hhmm, parseSystemTime } from "../time.ts";
import type { Check, CheckContext, CheckResult, Incident } from "../types.ts";

export interface ConfigMarker {
  t: number;
  symbol: string;
  params: Record<string, string>;
}

/** "key=value key=value" → object. Unknown fragments without "=" are ignored. */
export function parseParams(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(/\s+/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

export function parseMarkers(rows: Record<string, string>[]): ConfigMarker[] {
  return rows
    .map((r) => ({ t: parseSystemTime(r["t"] ?? ""), symbol: (r["symbol"] ?? "").trim(), params: parseParams(r["params"] ?? "") }))
    .filter((m) => Number.isFinite(m.t) && m.symbol.length > 0)
    .sort((a, b) => a.t - b.t);
}

/** Keys of `expected` whose value differs in `actual` (missing keys count as differences). */
export function diffExpected(expected: Record<string, string>, actual: Record<string, string>): string[] {
  return Object.keys(expected)
    .filter((k) => actual[k] !== expected[k])
    .map((k) => `${k}=${actual[k] ?? "∅"} (expected ${expected[k]})`);
}

/** Keys present in both markers whose value changed between them. */
export function diffMarkers(previous: Record<string, string>, current: Record<string, string>): string[] {
  return Object.keys(current)
    .filter((k) => previous[k] !== undefined && previous[k] !== current[k])
    .map((k) => `${k} ${previous[k]}→${current[k]}`);
}

/**
 * Compares the last runtime-configuration marker of each symbol with the expected configuration,
 * and flags any parameter that changed during the reviewed day. This catches the classic silent
 * failure: a component restarted with different inputs than the ones the team decided on.
 */
export function configDriftCheck(ctx: CheckContext): CheckResult {
  const { config, window } = ctx;
  const incidents: Incident[] = [];
  const lines: string[] = [];
  const table = readCsvFile(ctx.path(config.sources.runtimeConfig));
  if (!table) {
    incidents.push({ level: 1, check: "config", text: `runtime configuration file missing: ${config.sources.runtimeConfig}` });
    return { title: "Runtime configuration", lines: ["_Configuration check skipped: source missing._"], incidents };
  }
  const markers = parseMarkers(table.rows).filter((m) => m.t < window.end);
  const conform: string[] = [];
  const nonConform: string[] = [];
  const changedToday: string[] = [];
  const missing: string[] = [];
  const restarts: string[] = [];
  for (const symbol of config.symbols) {
    const own = markers.filter((m) => m.symbol === symbol);
    const last = own[own.length - 1];
    if (!last) {
      missing.push(symbol);
      continue;
    }
    const expected = config.expectedConfig[symbol] ?? {};
    const diffs = diffExpected(expected, last.params);
    if (diffs.length) nonConform.push(`${symbol}: ${diffs.join(", ")}`);
    else conform.push(symbol);
    const todays = own.filter((m) => m.t >= window.start);
    if (todays.length) restarts.push(`${symbol}×${todays.length}`);
    const prev = own[own.length - 2];
    if (prev && last.t >= window.start) {
      const ch = diffMarkers(prev.params, last.params);
      if (ch.length) changedToday.push(`${symbol} at ${hhmm(last.t)}: ${ch.join(", ")}`);
    }
  }
  lines.push(`- Restarts today: ${restarts.length ? restarts.join(", ") : "none"}.`);
  lines.push(
    `- Last configuration vs expected: ` +
      (nonConform.length ? `**${nonConform.length} non-conform** — ${nonConform.join("; ")}` : `conform ${conform.length}/${config.symbols.length}`) +
      (missing.length ? `; no marker for ${missing.join(", ")}` : "") +
      ".",
  );
  if (changedToday.length) lines.push(`- **Changed today**: ${changedToday.join("; ")}.`);
  for (const nc of nonConform) {
    incidents.push({ level: 2, check: "config", text: `runtime configuration non-conform — ${nc} (fix the inputs, or update the expectation if this was decided)` });
  }
  if (missing.length) incidents.push({ level: 2, check: "config", text: `no configuration marker known for ${missing.join(", ")}` });
  for (const ch of changedToday) incidents.push({ level: 2, check: "config", text: `parameters changed at restart — ${ch}` });
  return { title: "Runtime configuration", lines, incidents };
}

export const configDrift: Check = { name: "config", run: configDriftCheck };
