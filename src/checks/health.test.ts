import assert from "node:assert/strict";
import { utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { tempContext } from "../test/helpers.ts";
import { healthCheck, isMarketOpen, largestGapMinutes, parseHeartbeats } from "./health.ts";

function beats(times: string[], failAt?: string): string {
  return "t;ok;note\n" + times.map((t) => `2026-10-06 ${t};${t === failAt ? "0" : "1"};${t === failAt ? "port closed" : ""}`).join("\n") + "\n";
}

describe("health helpers", () => {
  it("finds the largest gap and where it starts", () => {
    const b = parseHeartbeats([
      { t: "2026-10-06 03:00", ok: "1" },
      { t: "2026-10-06 03:05", ok: "1" },
      { t: "2026-10-06 03:55", ok: "1" },
    ]);
    const g = largestGapMinutes(b);
    assert.equal(g.gap, 50);
    assert.equal(new Date(g.at).toISOString().slice(11, 16), "03:05");
    assert.equal(largestGapMinutes([]).gap, 0);
  });

  it("knows closed weekdays", () => {
    assert.equal(isMarketOpen(Date.UTC(2026, 9, 4), [0, 6]), false); // Sunday
    assert.equal(isMarketOpen(Date.UTC(2026, 9, 6), [0, 6]), true); // Tuesday
  });
});

describe("healthCheck", () => {
  it("raises level-2 incidents for gaps, failures and stale exports while the market is open", () => {
    const { ctx, dir, write } = tempContext();
    write("heartbeat.csv", beats(["09:00", "09:05", "09:50", "09:55"], "09:55"));
    write("state_ALPHA.csv", "x\n");
    write("state_BETA.csv", "x\n");
    const old = new Date(ctx.nowMs - 5 * 3_600_000);
    utimesSync(join(dir, "state_BETA.csv"), old, old);
    const r = healthCheck(ctx);
    const texts = r.incidents.map((i) => i.text);
    assert.ok(r.incidents.every((i) => i.level === 2));
    assert.ok(texts.some((t) => t.startsWith("heartbeat gap of 45 min")), texts.join("|"));
    assert.ok(texts.some((t) => t.includes("1 failure(s)") && t.includes("port closed")));
    assert.ok(texts.some((t) => t.includes("stale while the market is open: BETA")));
    assert.ok(!texts.some((t) => t.includes("ALPHA (")));
  });

  it("does not require freshness when the market is closed, and reports missing exports", () => {
    const sunday = Date.UTC(2026, 9, 4, 12);
    const { ctx, write } = tempContext("2026-10-04", sunday);
    write("heartbeat.csv", beats(["09:00", "09:05"]));
    write("state_ALPHA.csv", "x\n");
    const r = healthCheck(ctx);
    const texts = r.incidents.map((i) => i.text);
    assert.deepEqual(texts, ["no state export for BETA"]);
    assert.ok(r.lines.some((l) => l.includes("market closed")));
  });

  it("turns a missing heartbeat file into a tooling incident", () => {
    const { ctx, write } = tempContext();
    write("state_ALPHA.csv", "x\n");
    write("state_BETA.csv", "x\n");
    const r = healthCheck(ctx);
    assert.equal(r.incidents[0]!.level, 1);
  });
});
