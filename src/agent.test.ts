import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runAgent, runCheckSafely } from "./agent.ts";
import { loadConfig } from "./cli.ts";
import { baseConfig, tempDir } from "./test/helpers.ts";
import type { Check } from "./types.ts";

const EXAMPLES = join(import.meta.dirname, "..", "examples");

/** Copies the examples into a temp folder so tests never touch the committed register. */
function examplesCopy(): string {
  const dir = tempDir();
  cpSync(EXAMPLES, dir, { recursive: true, filter: (src) => !src.includes("reports") });
  return dir;
}

describe("runCheckSafely", () => {
  it("turns a crashing check into a level-1 incident instead of aborting", async () => {
    const boom: Check = { name: "boom", run: () => { throw new Error("disk on fire"); } };
    const cfg = baseConfig();
    const r = await runCheckSafely(boom, { config: cfg, window: { day: "2026-10-06", start: 0, end: 1 }, nowMs: 0, path: (f) => f });
    assert.deepEqual(r.incidents, [{ level: 1, check: "boom", text: 'check "boom" crashed: disk on fire' }]);
  });
});

describe("runAgent on the bundled example", () => {
  const now = Date.UTC(2026, 9, 7, 6, 15); // 06:15 system clock, the morning after

  it("produces the full report and appends level-3 questions to the register", async () => {
    const dir = examplesCopy();
    const { config } = loadConfig(join(dir, "config.json"));
    const out = await runAgent(config, { baseDir: dir, day: "2026-10-06", nowMs: now });
    assert.equal(out.day, "2026-10-06");
    assert.ok(existsSync(out.reportPath));
    for (const title of ["Activity of the day", "Expected vs actual", "Health", "Runtime configuration", "Account", "Incidents", "Decision register"]) {
      assert.ok(out.report.includes(title), `missing section ${title}`);
    }
    assert.ok(out.incidents.some((i) => i.level === 2));
    assert.ok(out.incidents.every((i) => i.level !== 1), "the example must not trigger tooling incidents: " + out.incidents.map((i) => i.text).join(" | "));
    assert.ok(/N3 \d+, N2 \d+, N1 0/.test(out.summary));
  });

  it("defaults the day from the injected now", async () => {
    const dir = examplesCopy();
    const { config } = loadConfig(join(dir, "config.json"));
    const out = await runAgent(config, { baseDir: dir, nowMs: now, dryRun: true });
    assert.equal(out.day, "2026-10-06");
    assert.ok(out.reportPath.endsWith("_preview_2026-10-06.md"));
  });

  it("does not write the register in dry-run mode, and writes it otherwise", async () => {
    const dir = examplesCopy();
    const { config } = loadConfig(join(dir, "config.json"));
    // force a level-3 incident with a collapsing equity curve
    mkdirSync(join(dir, "data"), { recursive: true });
    writeFileSync(join(dir, "data", "equity.csv"), "t;balance;equity;openPositions\n2026-10-06 00:05;100000;100000;0\n2026-10-06 20:00;100000;93000;0\n");
    const before = readFileSync(join(dir, "decisions.md"), "utf8");
    const dry = await runAgent(config, { baseDir: dir, day: "2026-10-06", nowMs: now, dryRun: true });
    assert.ok(dry.questions.some((q) => q.startsWith("GO / NO-GO")));
    assert.equal(readFileSync(join(dir, "decisions.md"), "utf8"), before);
    await runAgent(config, { baseDir: dir, day: "2026-10-06", nowMs: now });
    const after = readFileSync(join(dir, "decisions.md"), "utf8");
    assert.ok(after.includes("- [ ] 2026-10-06 — GO / NO-GO"));
  });
});
