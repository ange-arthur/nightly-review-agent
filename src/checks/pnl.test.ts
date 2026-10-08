import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tempContext } from "../test/helpers.ts";
import { dayPnlPct, parseEquity, pnlCheck } from "./pnl.ts";

const curve = (open: number, close: number) =>
  `t;balance;equity;openPositions\n2026-10-06 00:05;${open};${open};0\n2026-10-06 23:55;${open};${close};2\n`;

describe("pnl", () => {
  it("computes the day P&L from opening balance to closing equity", () => {
    const pts = parseEquity([
      { t: "2026-10-06 00:05", balance: "100000", equity: "100000" },
      { t: "2026-10-06 12:00", balance: "100000", equity: "99000" },
    ]);
    assert.equal(dayPnlPct(pts), -1);
    assert.equal(dayPnlPct([]), null);
  });

  it("stays silent above the warning threshold", () => {
    const { ctx, write } = tempContext();
    write("equity.csv", curve(100000, 99500));
    assert.equal(pnlCheck(ctx).incidents.length, 0);
  });

  it("warns at level 2 and blocks at level 3", () => {
    const warn = tempContext();
    warn.write("equity.csv", curve(100000, 96500));
    assert.deepEqual(pnlCheck(warn.ctx).incidents.map((i) => i.level), [2]);
    const block = tempContext();
    block.write("equity.csv", curve(100000, 94000));
    const inc = pnlCheck(block.ctx).incidents;
    assert.deepEqual(inc.map((i) => i.level), [3]);
    assert.ok(inc[0]!.text.includes("waiting for human GO"));
  });
});
