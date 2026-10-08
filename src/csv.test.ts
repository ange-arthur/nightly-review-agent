import assert from "node:assert/strict";
import { utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { detectDelimiter, fileAgeMinutes, parseCsv, readCsvFile } from "./csv.ts";
import { tempDir } from "./test/helpers.ts";

describe("csv", () => {
  it("detects the delimiter from the header", () => {
    assert.equal(detectDelimiter("a;b;c"), ";");
    assert.equal(detectDelimiter("a,b,c"), ",");
    assert.equal(detectDelimiter("single"), ";");
  });

  it("parses rows into objects, pads short rows and keeps extra cells", () => {
    const t = parseCsv("t;symbol;result\n2026-10-06 09:00;ALPHA;1.5\n2026-10-06 10:00;BETA\n2026-10-06 11:00;GAMMA;2;extra\n\n");
    assert.deepEqual(t.header, ["t", "symbol", "result"]);
    assert.equal(t.rows.length, 3);
    assert.equal(t.rows[1]!["result"], "");
    assert.equal(t.rows[2]!["3"], "extra");
  });

  it("returns an empty table for empty input and null for a missing file", () => {
    assert.deepEqual(parseCsv(""), { header: [], rows: [] });
    assert.equal(readCsvFile(join(tempDir(), "nope.csv")), null);
  });

  it("measures file age and clamps files newer than the injected now to zero", () => {
    const dir = tempDir();
    const f = join(dir, "x.csv");
    writeFileSync(f, "a\n");
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(f, twoHoursAgo, twoHoursAgo);
    const age = fileAgeMinutes(f, Date.now());
    assert.ok(age !== null && age > 119 && age < 121, `age was ${age}`);
    assert.equal(fileAgeMinutes(f, Date.now() - 10 * 3_600_000), 0);
    assert.equal(fileAgeMinutes(join(dir, "missing"), Date.now()), null);
  });
});
