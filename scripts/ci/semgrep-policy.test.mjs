import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateSemgrep } from "./semgrep-policy.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "insecur-semgrep-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'headers.set("X-Frame-Options", "DENY");\n';
  writeFileSync(join(root, "index.ts"), source);
  const exception = {
    rule: "fixed-header",
    path: "index.ts",
    line: 1,
    file_sha256: createHash("sha256").update(source).digest("hex"),
  };
  const result = {
    check_id: exception.rule,
    path: exception.path,
    start: { line: exception.line },
    extra: { severity: "WARNING", lines: "REDACTED", message: "REDACTED" },
  };
  return { root, exception, result };
}

test("only the reviewed rule, location and unchanged file are accepted", (t) => {
  const { root, exception, result } = fixture(t);
  const evaluate = (finding) =>
    evaluateSemgrep({ results: [finding], errors: [] }, [exception], root);
  assert.equal(evaluate(result).blocking_count, 0);
  for (const delta of [{ check_id: "new-rule" }, { path: "another.ts" }, { start: { line: 2 } }]) {
    assert.equal(evaluate({ ...result, ...delta }).blocking_count, 1);
  }
  writeFileSync(join(root, "index.ts"), 'headers.set("X-Frame-Options", input);\n');
  assert.equal(evaluate(result).blocking_count, 1);
});

test("new findings block at every severity and raw scanner data is omitted", (t) => {
  const { root, result } = fixture(t);
  for (const severity of ["INFO", "WARNING", "ERROR", "MEDIUM"]) {
    const policy = evaluateSemgrep(
      { results: [{ ...result, extra: { ...result.extra, severity } }], errors: [] },
      [],
      root,
    );
    assert.equal(policy.blocking_count, 1);
    assert.equal(JSON.stringify(policy).includes("REDACTED"), false);
  }
});

test("scanner errors and incomplete reports fail closed", () => {
  const policy = evaluateSemgrep(
    { results: [], errors: [{ level: "warn" }, { level: "error" }] },
    [],
  );
  assert.equal(policy.scanner_error_count, 1);
  for (const report of [{}, { results: [] }, { errors: [] }]) {
    assert.throws(() => evaluateSemgrep(report, []), /must contain/u);
  }
  assert.throws(
    () => evaluateSemgrep({ results: [{}], errors: [] }, []),
    /missing valid metadata/u,
  );
});
