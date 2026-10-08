import type { DayWindow } from "./types.ts";

const DAY_MS = 86_400_000;

/**
 * Parses a timestamp written in the monitored system's clock ("YYYY-MM-DD HH:MM[:SS]" or
 * "YYYY-MM-DDTHH:MM[:SS]") into epoch ms, interpreting it as UTC. All comparisons in the agent
 * happen in that same frame, so the offset to real UTC never leaks into the logic.
 */
export function parseSystemTime(ts: string): number {
  const m = /^(\d{4})[-.](\d{2})[-.](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(ts.trim());
  if (!m) return Number.NaN;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, m[6] ? +m[6] : 0);
}

export function dayWindow(day: string): DayWindow {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`invalid day "${day}", expected YYYY-MM-DD`);
  const start = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
  return { day, start, end: start + DAY_MS };
}

/** Converts real UTC epoch ms into the system-clock frame. */
export function toSystemClock(utcMs: number, utcOffsetHours: number): number {
  return utcMs + utcOffsetHours * 3_600_000;
}

/**
 * Day to review when none is given: the current system-clock day, or the previous one when the
 * run happens before `rolloverHour` (a report launched after midnight is about the day that ended).
 */
export function defaultDay(nowSystemMs: number, rolloverHour = 10): string {
  const d = new Date(nowSystemMs);
  const shifted = d.getUTCHours() < rolloverHour ? nowSystemMs - DAY_MS : nowSystemMs;
  return new Date(shifted).toISOString().slice(0, 10);
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function hhmm(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

/** Signed number with two decimals: +1.50 / -0.25. */
export function signed(v: number, digits = 2): string {
  return (v >= 0 ? "+" : "") + v.toFixed(digits);
}

export function weekday(ms: number): number {
  return new Date(ms).getUTCDay();
}
