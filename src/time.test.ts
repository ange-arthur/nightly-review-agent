import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayWindow, defaultDay, hhmm, parseSystemTime, signed, toSystemClock } from "./time.ts";

describe("time", () => {
  it("parses system-clock timestamps in both common layouts", () => {
    assert.equal(parseSystemTime("2026-10-06 09:15:30"), Date.UTC(2026, 9, 6, 9, 15, 30));
    assert.equal(parseSystemTime("2026-10-06T09:15"), Date.UTC(2026, 9, 6, 9, 15, 0));
    assert.equal(parseSystemTime("2026.10.06 09:15:30"), Date.UTC(2026, 9, 6, 9, 15, 30));
    assert.ok(Number.isNaN(parseSystemTime("yesterday")));
  });

  it("builds a half-open day window", () => {
    const w = dayWindow("2026-10-06");
    assert.equal(w.start, Date.UTC(2026, 9, 6));
    assert.equal(w.end - w.start, 86_400_000);
    assert.throws(() => dayWindow("06/10/2026"));
  });

  it("defaults to the previous day before the rollover hour", () => {
    assert.equal(defaultDay(Date.UTC(2026, 9, 7, 6, 15)), "2026-10-06");
    assert.equal(defaultDay(Date.UTC(2026, 9, 7, 12, 0)), "2026-10-07");
    assert.equal(defaultDay(Date.UTC(2026, 9, 7, 6, 15), 5), "2026-10-07");
  });

  it("shifts real UTC into the system clock", () => {
    assert.equal(toSystemClock(0, 3), 3 * 3_600_000);
  });

  it("formats helpers", () => {
    assert.equal(signed(1.5), "+1.50");
    assert.equal(signed(-0.251), "-0.25");
    assert.equal(hhmm(Date.UTC(2026, 9, 6, 9, 5)), "09:05");
  });
});
