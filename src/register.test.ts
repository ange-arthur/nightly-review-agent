import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyRegister, parseRegister, registerBody, withQuestions } from "./register.ts";

const RAW = `# Decision register — demo

## Open decisions

- [ ] 2026-10-03 — Keep the per-symbol rule on BETA?

## Resolved

- [x] 2026-09-30 — Switch entry mode (GO)
`;

describe("register", () => {
  it("parses open and resolved items", () => {
    const r = parseRegister(RAW);
    assert.equal(r.open.length, 1);
    assert.equal(r.resolved.length, 1);
  });

  it("appends new questions after existing open items and skips known ones", () => {
    const { raw, added } = withQuestions(RAW, "2026-10-06", ["Keep the per-symbol rule on BETA?", "GO / NO-GO: pause ALPHA"]);
    assert.deepEqual(added, ["GO / NO-GO: pause ALPHA"]);
    const r = parseRegister(raw);
    assert.deepEqual(r.open, ["- [ ] 2026-10-03 — Keep the per-symbol rule on BETA?", "- [ ] 2026-10-06 — GO / NO-GO: pause ALPHA"]);
    assert.equal(r.resolved.length, 1);
  });

  it("is idempotent", () => {
    const once = withQuestions(RAW, "2026-10-06", ["Q1"]).raw;
    const twice = withQuestions(once, "2026-10-07", ["Q1"]);
    assert.equal(twice.added.length, 0);
    assert.equal(twice.raw, once);
  });

  it("creates the section when the file has none and strips the title for embedding", () => {
    const { raw } = withQuestions("# Register\n", "2026-10-06", ["Q1"]);
    assert.ok(raw.includes("## Open decisions\n- [ ] 2026-10-06 — Q1"));
    assert.ok(!registerBody(emptyRegister("x")).startsWith("# "));
  });
});
