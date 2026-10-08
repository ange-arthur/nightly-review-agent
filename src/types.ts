/**
 * Core types of the nightly review agent.
 *
 * Incident levels follow a three-level protocol:
 *   1 — tooling: the agent or its data pipeline misbehaved; fix and report.
 *   2 — anomaly: the monitored system did something unexpected; report and investigate.
 *   3 — production: an action on the live system would be required; prepare it, then BLOCK
 *       until a human gives an explicit GO. The agent never acts on level 3 by itself.
 */
export type IncidentLevel = 1 | 2 | 3;

export interface Incident {
  level: IncidentLevel;
  text: string;
  /** Name of the check that raised it. */
  check: string;
}

export interface CheckResult {
  /** Section title in the report. */
  title: string;
  /** Markdown lines of the section body. */
  lines: string[];
  incidents: Incident[];
  /** Questions that need a human answer; level-3 incidents are added automatically. */
  questions?: string[];
}

export interface DayWindow {
  /** YYYY-MM-DD in the monitored system's clock. */
  day: string;
  /** Inclusive start, epoch ms of the system-clock day interpreted as UTC. */
  start: number;
  /** Exclusive end. */
  end: number;
}

export interface SourcesConfig {
  /** Events actually executed by the system: t;symbol;dir;result[;id] */
  actual: string;
  /** Events the reference model expected: t;symbol;dir;result[;id] */
  expected: string;
  /** Heartbeat log of the supervisor: t;ok[;note] */
  heartbeat: string;
  /** Runtime configuration markers emitted at each (re)start: t;symbol;params */
  runtimeConfig: string;
  /** Account curve: t;balance;equity[;openPositions] */
  equity: string;
  /** Per-symbol state export whose freshness proves the system is alive. {symbol} is substituted. */
  statePattern: string;
}

export interface AgentConfig {
  /** Display name of the monitored system. */
  name: string;
  /** Offset of the system clock from UTC, in hours (e.g. 3 for a broker on UTC+3). */
  utcOffsetHours: number;
  /** Directory holding the source files (relative paths resolve against the config file). */
  dataDir: string;
  reportsDir: string;
  registerFile: string;
  symbols: string[];
  sources: SourcesConfig;
  reconcile: {
    toleranceMinutes: number;
    /** Result divergence (in the result unit) above which a matched pair is an anomaly. */
    maxResultDivergence: number;
  };
  health: {
    maxHeartbeatGapMinutes: number;
    maxStateAgeMinutes: number;
    /** Weekdays (0 = Sunday) during which freshness is not required. */
    closedWeekdays: number[];
  };
  thresholds: {
    /** Daily P&L % below which a level-2 warning is raised. */
    dailyLossWarnPct: number;
    /** Daily P&L % below which a level-3 (blocking) incident is raised. */
    dailyLossBlockPct: number;
  };
  /** Expected runtime configuration per symbol (key → value). */
  expectedConfig: Record<string, Record<string, string>>;
}

export interface CheckContext {
  config: AgentConfig;
  window: DayWindow;
  /** "Now" in the system clock, epoch ms interpreted as UTC. Injectable for reproducible runs. */
  nowMs: number;
  /** Resolves a source file name against the data directory. */
  path: (file: string) => string;
}

export interface Check {
  name: string;
  run: (ctx: CheckContext) => CheckResult | Promise<CheckResult>;
}

export interface RunOptions {
  day?: string;
  nowMs?: number;
  dryRun?: boolean;
  checks?: Check[];
  /** Base directory used to resolve relative paths of the config. */
  baseDir?: string;
}

export interface RunOutcome {
  day: string;
  reportPath: string;
  report: string;
  incidents: Incident[];
  questions: string[];
  summary: string;
}
