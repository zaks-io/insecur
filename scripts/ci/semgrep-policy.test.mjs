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
  assert.equal(policy.scanner_error_count, 2);
  for (const report of [{}, { results: [] }, { errors: [] }]) {
    assert.throws(() => evaluateSemgrep(report, []), /must contain/u);
  }
  assert.throws(
    () => evaluateSemgrep({ results: [{}], errors: [] }, []),
    /missing valid metadata/u,
  );
});

test("warning-level scan failures block, including the upstream timeout report shape", () => {
  for (const type of ["Timeout", "OutOfMemory", "StackOverflow", "ParseError", "unknown"]) {
    const policy = evaluateSemgrep({ results: [], errors: [{ level: "warn", type }] }, []);
    assert.equal(policy.scanner_error_count, 1);
  }
});

test("scanner diagnostics retain error kinds and locations without source text", () => {
  const policy = evaluateSemgrep(
    {
      results: [],
      errors: [
        {
          level: "warn",
          type: "Timeout",
          path: "apps/web/src/index.ts",
          rule_id: "javascript.slow-rule",
          message: "REDACTED source",
          details: "REDACTED details",
        },
        { type: ["PatternParseError", ["REDACTED pattern"]] },
        { type: "REDACTED unknown", path: "REDACTED source\n", rule_id: "REDACTED rule\n" },
      ],
    },
    [],
  );
  assert.equal(policy.scanner_error_count, 3);
  assert.deepEqual(policy.scanner_errors, [
    { type: "Timeout", path: "apps/web/src/index.ts", rule: "javascript.slow-rule" },
    { type: "PatternParseError" },
    { type: "Unknown" },
  ]);
  assert.equal(JSON.stringify(policy).includes("REDACTED"), false);
});

test("only known partial parsing on unchanged reviewed files is accepted", (t) => {
  const { root, exception } = fixture(t);
  const parsing = [{ path: exception.path, file_sha256: exception.file_sha256 }];
  const warning = { level: "warn", type: ["PartialParsing", [{ path: exception.path }]] };
  const evaluate = (error) => evaluateSemgrep({ results: [], errors: [error] }, [], root, parsing);
  assert.equal(evaluate(warning).scanner_error_count, 0);
  assert.equal(evaluate({ ...warning, level: "error" }).scanner_error_count, 1);
  assert.equal(
    evaluate({ ...warning, type: ["PartialParsing", [{ path: "unreviewed.ts" }]] })
      .scanner_error_count,
    1,
  );
  assert.equal(evaluate({ ...warning, type: ["PartialParsing", []] }).scanner_error_count, 1);
  writeFileSync(join(root, exception.path), "changed source");
  assert.equal(evaluate(warning).scanner_error_count, 1);
});

test("findings in TanStack parameter routes retain their metadata and block", (t) => {
  const { root, result } = fixture(t);
  const path = "apps/web/src/routes/orgs.$orgId.tsx";
  const policy = evaluateSemgrep({ results: [{ ...result, path }], errors: [] }, [], root);
  assert.equal(policy.blocking_count, 1);
  assert.equal(policy.findings[0].path, path);
});
