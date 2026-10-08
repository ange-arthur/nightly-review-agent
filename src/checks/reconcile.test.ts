import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tempContext } from "../test/helpers.ts";
import { matchEvents, parseEvents, reconcileCheck, type Event } from "./reconcile.ts";

const ev = (t: string, symbol: string, dir: 1 | -1, result: number, id = "x"): Event => ({
  t: Date.UTC(2026, 9, 6, +t.slice(0, 2), +t.slice(3, 5)),
  symbol,
  dir,
  result,
  id,
});

describe("matchEvents", () => {
  it("pairs same symbol and direction within tolerance, nearest first", () => {
    const expected = [ev("09:00", "ALPHA", 1, 2), ev("09:30", "ALPHA", 1, 1)];
    const actual = [ev("09:31", "ALPHA", 1, 1, "b"), ev("09:02", "ALPHA", 1, 2, "a")];
    const m = matchEvents(expected, actual, 45);
    assert.equal(m.matched.length, 2);
    assert.equal(m.matched[0]!.actual.id, "a");
    assert.equal(m.matched[1]!.actual.id, "b");
    assert.equal(m.missing.length, 0);
    assert.equal(m.extra.length, 0);
  });

  it("does not pair across direction, symbol or beyond tolerance", () => {
    const expected = [ev("09:00", "ALPHA", 1, 2), ev("12:00", "BETA", -1, 1), ev("15:00", "GAMMA", 1, 1)];
    const actual = [ev("09:05", "ALPHA", -1, 2), ev("13:00", "BETA", -1, 1), ev("15:10", "GAMMA", 1, -1)];
    const m = matchEvents(expected, actual, 45);
    assert.deepEqual(m.matched.map((p) => p.expected.symbol), ["GAMMA"]);
    assert.deepEqual(m.missing.map((e) => e.symbol), ["ALPHA", "BETA"]);
    assert.deepEqual(m.extra.map((e) => e.symbol), ["ALPHA", "BETA"]);
  });

  it("never reuses an actual event", () => {
    const expected = [ev("09:00", "ALPHA", 1, 1), ev("09:10", "ALPHA", 1, 1)];
    const actual = [ev("09:05", "ALPHA", 1, 1)];
    const m = matchEvents(expected, actual, 45);
    assert.equal(m.matched.length, 1);
    assert.equal(m.missing.length, 1);
  });
});

describe("parseEvents", () => {
  it("drops rows without a parsable time or symbol and defaults ids", () => {
    const rows = [
      { t: "2026-10-06 09:00", symbol: "ALPHA", dir: "1", result: "1.5" },
      { t: "garbage", symbol: "ALPHA", dir: "1", result: "1" },
      { t: "2026-10-06 10:00", symbol: "", dir: "-1", result: "1" },
    ];
    const out = parseEvents(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.id, "1");
    assert.equal(out[0]!.dir, 1);
  });
});

describe("reconcileCheck", () => {
  it("reports missing, extra and divergent events as level-2 incidents", () => {
    const { ctx, write } = tempContext();
    write("expected.csv", "t;symbol;dir;result\n2026-10-06 09:00;ALPHA;1;2.0\n2026-10-06 16:30;ALPHA;-1;3.0\n2026-10-06 11:00;BETA;-1;-1.0\n");
    write("actual.csv", "t;symbol;dir;result;id\n2026-10-06 09:02;ALPHA;1;0.8;1001\n2026-10-06 11:01;BETA;-1;-1.0;1002\n2026-10-06 15:20;BETA;1;-1.0;1003\n");
    const r = reconcileCheck(ctx);
    const texts = r.incidents.map((i) => i.text);
    assert.ok(r.incidents.every((i) => i.level === 2));
    assert.ok(texts.some((t) => t.includes("diverges")), texts.join("|"));
    assert.ok(texts.some((t) => t.includes("not executed: ALPHA 16:30")));
    assert.ok(texts.some((t) => t.includes("without reference: BETA 15:20")));
    assert.ok(r.lines.some((l) => l.includes("**67 %**")));
  });

  it("degrades to a level-1 incident when a source is missing", () => {
    const { ctx, write } = tempContext();
    write("actual.csv", "t;symbol;dir;result\n");
    const r = reconcileCheck(ctx);
    assert.equal(r.incidents.length, 1);
    assert.equal(r.incidents[0]!.level, 1);
  });
});
