#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runAgent } from "./agent.ts";
import { parseSystemTime } from "./time.ts";
import type { AgentConfig } from "./types.ts";

const USAGE = `nightly-review — scheduled review of an automated system

Usage: node src/cli.ts --config <file.json> [--date YYYY-MM-DD] [--now "YYYY-MM-DD HH:MM"] [--dry-run]

  --config   agent configuration (paths inside resolve against the config file's folder)
  --date     day to review (default: the system-clock day that just ended)
  --now      inject "now" in the system clock, for reproducible runs on archived data
  --dry-run  write a _preview_ report and do not touch the decision register
`;

export function parseArgs(argv: string[]): { config?: string; date?: string; now?: string; dryRun: boolean; help: boolean } {
  const out: { config?: string; date?: string; now?: string; dryRun: boolean; help: boolean } = { dryRun: false, help: false };
  const value = (flag: string, i: number): string => {
    const v = argv[i];
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--config") out.config = value(a, ++i);
    else if (a === "--date") out.date = value(a, ++i);
    else if (a === "--now") out.now = value(a, ++i);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

export function loadConfig(file: string): { config: AgentConfig; baseDir: string } {
  const abs = resolve(file);
  const config = JSON.parse(readFileSync(abs, "utf8")) as AgentConfig;
  return { config, baseDir: dirname(abs) };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.config) {
    process.stdout.write(USAGE);
    return args.help ? 0 : 2;
  }
  const { config, baseDir } = loadConfig(args.config);
  const nowMs = args.now ? parseSystemTime(args.now) : undefined;
  if (args.now && !Number.isFinite(nowMs)) throw new Error(`invalid --now "${args.now}"`);
  const outcome = await runAgent(config, {
    baseDir,
    dryRun: args.dryRun,
    ...(args.date ? { day: args.date } : {}),
    ...(nowMs !== undefined ? { nowMs } : {}),
  });
  process.stdout.write(`${args.dryRun ? "preview" : "report"} written -> ${outcome.reportPath}\n${outcome.summary}\n`);
  // Exit code mirrors the worst incident level so a scheduler can alert on it.
  const worst = outcome.incidents.reduce((m, i) => Math.max(m, i.level), 0);
  return worst === 3 ? 3 : 0;
}

const invokedDirectly = process.argv[1] !== undefined && /cli\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`nightly-review: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
