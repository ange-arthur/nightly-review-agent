import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tempContext } from "../test/helpers.ts";
import { configDriftCheck, diffExpected, diffMarkers, parseParams } from "./configDrift.ts";

describe("config helpers", () => {
  it("parses key=value fragments", () => {
    assert.deepEqual(parseParams("mode=replace rr=5.0 note build=1004"), { mode: "replace", rr: "5.0", build: "1004" });
  });

  it("diffs against expectation and between markers", () => {
    assert.deepEqual(diffExpected({ mode: "replace", rr: "5.0" }, { mode: "slot", rr: "5.0" }), ["mode=slot (expected replace)"]);
    assert.deepEqual(diffExpected({ mode: "replace" }, {}), ["mode=∅ (expected replace)"]);
    assert.deepEqual(diffMarkers({ build: "1003", rr: "5.0" }, { build: "1004", rr: "5.0", extra: "1" }), ["build 1003→1004"]);
  });
});

describe("configDriftCheck", () => {
  it("flags non-conform markers, same-day changes and missing symbols", () => {
    const { ctx, write } = tempContext();
    write(
      "runtime_config.csv",
      "t;symbol;params\n" +
        "2026-10-01 00:05;ALPHA;mode=replace rr=5.0 build=1003\n" +
        "2026-10-06 08:00;ALPHA;mode=replace rr=5.0 build=1004\n" +
        "2026-10-01 00:05;BETA;mode=slot rr=5.0 build=1004\n",
    );
    const r = configDriftCheck(ctx);
    const texts = r.incidents.map((i) => i.text);
    assert.ok(texts.some((t) => t.includes("non-conform — BETA: mode=slot (expected replace)")), texts.join("|"));
    assert.ok(texts.some((t) => t.includes("changed at restart — ALPHA at 08:00: build 1003→1004")));
    assert.ok(r.lines.some((l) => l.includes("Restarts today: ALPHA×1")));
    assert.ok(r.incidents.every((i) => i.level === 2));
  });

  it("ignores markers after the reviewed day and reports symbols without any marker", () => {
    const { ctx, write } = tempContext();
    write("runtime_config.csv", "t;symbol;params\n2026-10-07 00:05;ALPHA;mode=replace rr=5.0\n");
    const r = configDriftCheck(ctx);
    assert.deepEqual(
      r.incidents.map((i) => i.text),
      ["no configuration marker known for ALPHA, BETA"],
    );
  });
});
