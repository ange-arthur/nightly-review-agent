import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayWindow } from "../time.ts";
import type { AgentConfig, CheckContext } from "../types.ts";

export function tempDir(prefix = "nra-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-system",
    utcOffsetHours: 0,
    dataDir: "data",
    reportsDir: "reports",
    registerFile: "decisions.md",
    symbols: ["ALPHA", "BETA"],
    sources: {
      actual: "actual.csv",
      expected: "expected.csv",
      heartbeat: "heartbeat.csv",
      runtimeConfig: "runtime_config.csv",
      equity: "equity.csv",
      statePattern: "state_{symbol}.csv",
    },
    reconcile: { toleranceMinutes: 45, maxResultDivergence: 0.5 },
    health: { maxHeartbeatGapMinutes: 30, maxStateAgeMinutes: 90, closedWeekdays: [0, 6] },
    thresholds: { dailyLossWarnPct: -3, dailyLossBlockPct: -5 },
    expectedConfig: { ALPHA: { mode: "replace", rr: "5.0" }, BETA: { mode: "replace", rr: "5.0" } },
    ...overrides,
  };
}

/** A context whose data directory is a fresh temp folder; `write` drops files into it. */
export function tempContext(day = "2026-10-06", nowMs?: number, overrides: Partial<AgentConfig> = {}) {
  const dir = tempDir();
  const window = dayWindow(day);
  const ctx: CheckContext = {
    config: baseConfig(overrides),
    window,
    nowMs: nowMs ?? window.start + 15 * 3_600_000, // 15:00 on the reviewed day (a Tuesday)
    path: (file) => join(dir, file),
  };
  const write = (file: string, content: string) => writeFileSync(join(dir, file), content, "utf8");
  return { ctx, dir, write };
}
