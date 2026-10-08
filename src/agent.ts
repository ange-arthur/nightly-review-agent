import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { activity } from "./checks/activity.ts";
import { configDrift } from "./checks/configDrift.ts";
import { health } from "./checks/health.ts";
import { pnl } from "./checks/pnl.ts";
import { reconcile } from "./checks/reconcile.ts";
import { loadRegister, registerBody, saveRegister, withQuestions } from "./register.ts";
import { renderReport, summaryLine } from "./report.ts";
import { dayWindow, defaultDay, toSystemClock } from "./time.ts";
import type { AgentConfig, Check, CheckContext, CheckResult, Incident, RunOptions, RunOutcome } from "./types.ts";

export const defaultChecks: Check[] = [activity, reconcile, health, configDrift, pnl];

function resolveFrom(base: string, p: string): string {
  return isAbsolute(p) ? p : resolve(base, p);
}

/**
 * Runs one check in isolation. A check that throws must never take the whole report down: the
 * failure becomes a level-1 (tooling) incident and the other sections are still produced.
 */
export async function runCheckSafely(check: Check, ctx: CheckContext): Promise<CheckResult> {
  try {
    return await check.run(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      title: check.name,
      lines: [`_Check failed: ${msg}_`],
      incidents: [{ level: 1, check: check.name, text: `check "${check.name}" crashed: ${msg}` }],
    };
  }
}

export async function runAgent(config: AgentConfig, options: RunOptions = {}): Promise<RunOutcome> {
  const base = options.baseDir ?? process.cwd();
  const nowMs = options.nowMs ?? toSystemClock(Date.now(), config.utcOffsetHours);
  const day = options.day ?? defaultDay(nowMs);
  const window = dayWindow(day);
  const dataDir = resolveFrom(base, config.dataDir);
  const ctx: CheckContext = { config, window, nowMs, path: (file) => join(dataDir, file) };

  const sections: CheckResult[] = [];
  for (const check of options.checks ?? defaultChecks) sections.push(await runCheckSafely(check, ctx));

  const incidents: Incident[] = sections.flatMap((s) => s.incidents);
  const questions = [
    ...sections.flatMap((s) => s.questions ?? []),
    ...incidents.filter((i) => i.level === 3).map((i) => `GO / NO-GO: ${i.text}`),
  ];

  const registerPath = resolveFrom(base, config.registerFile);
  const register = loadRegister(registerPath, config.name);
  const updated = withQuestions(register.raw, day, questions);
  if (!options.dryRun && updated.added.length) saveRegister(registerPath, updated.raw);

  const report = renderReport({
    name: config.name,
    day,
    generatedAt: new Date(nowMs).toISOString().replace("T", " ").slice(0, 16) + " (system clock)",
    sections,
    incidents,
    questions,
    registerBody: registerBody(updated.raw),
  });

  const reportsDir = resolveFrom(base, config.reportsDir);
  const reportPath = join(reportsDir, `${options.dryRun ? "_preview_" : "report_"}${day}.md`);
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(reportPath, report, "utf8");

  return { day, reportPath, report, incidents, questions, summary: summaryLine(day, incidents, questions) };
}
