import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export function evaluateSemgrep(report, exceptions, rootDir = repoRoot, parsingExceptions = []) {
  if (!Array.isArray(report?.results) || !Array.isArray(report?.errors)) {
    throw new Error("Semgrep report must contain results and errors arrays");
  }
  const findings = report.results.map((result) => {
    const { check_id: rule, path, start, extra } = result;
    if (
      typeof rule !== "string" ||
      !/^[\w.-]+$/u.test(rule) ||
      typeof path !== "string" ||
      !/^[\w.$/@-]+$/u.test(path) ||
      !Number.isInteger(start?.line) ||
      start.line < 1 ||
      typeof extra?.severity !== "string" ||
      !/^[A-Z]+$/u.test(extra.severity)
    ) {
      throw new Error("Semgrep finding is missing valid metadata");
    }
    const exception = exceptions.find(
      (entry) => entry.rule === rule && entry.path === path && entry.line === start.line,
    );
    // A changed file invalidates its reviewed exceptions, even if the finding has not moved.
    const accepted = Boolean(
      exception &&
      createHash("sha256")
        .update(readFileSync(join(rootDir, exception.path)))
        .digest("hex") === exception.file_sha256,
    );
    return { rule, path, line: start.line, severity: extra.severity, accepted };
  });
  return {
    findings,
    blocking_count: findings.filter((finding) => !finding.accepted).length,
    scanner_error_count: report.errors.filter(
      (error) => !isAcceptedPartialParsing(error, parsingExceptions, rootDir),
    ).length,
  };
}

function isAcceptedPartialParsing(error, exceptions, rootDir) {
  if (
    error.level !== "warn" ||
    !Array.isArray(error.type) ||
    error.type[0] !== "PartialParsing" ||
    !Array.isArray(error.type[1]) ||
    error.type[1].length === 0
  ) {
    return false;
  }
  // Known parser limitations are accepted only for the exact reviewed source files.
  return error.type[1].every((span) => {
    const hash = exceptions.find((entry) => entry.path === span.path)?.file_sha256;
    return (
      typeof hash === "string" &&
      createHash("sha256")
        .update(readFileSync(join(rootDir, span.path)))
        .digest("hex") === hash
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    throw new Error("usage: semgrep-policy.mjs <scanner-json> <metadata-json>");
  }
  const report = JSON.parse(readFileSync(input, "utf8"));
  const exceptions = JSON.parse(
    readFileSync(join(repoRoot, "config/semgrep-exceptions.json"), "utf8"),
  );
  const policy = evaluateSemgrep(report, exceptions.findings, repoRoot, exceptions.partial_parsing);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(policy, null, 2)}\n`);
  console.log(
    `Semgrep: ${policy.findings.length} findings, ${policy.blocking_count} blocking, ${policy.scanner_error_count} scanner errors.`,
  );
  process.exitCode = policy.blocking_count > 0 || policy.scanner_error_count > 0 ? 1 : 0;
}
