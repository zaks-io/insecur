#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const outArgIndex = args.indexOf("--out");
const allowedOutBase = resolve(repoRoot, "artifacts/security");
const requestedOut = outArgIndex === -1 ? "artifacts/security" : (args[outArgIndex + 1] ?? "");
const outDir = resolve(repoRoot, requestedOut);

if (outArgIndex !== -1 && !requestedOut) {
  console.error("--out requires a directory");
  process.exit(2);
}

const pathFromAllowedBase = relative(allowedOutBase, outDir);
const isAllowedOutDir =
  pathFromAllowedBase === "" ||
  (!pathFromAllowedBase.startsWith("..") && !isAbsolute(pathFromAllowedBase));
if (isAbsolute(requestedOut) || requestedOut === "." || !isAllowedOutDir) {
  console.error("--out must be artifacts/security or a child directory");
  process.exit(2);
}

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

const startedAt = new Date().toISOString();
const steps = [];
const FS_EXCLUDE_DIRS = ["node_modules", ".git", ".turbo", "coverage", "artifacts", "dist"];
const SEMGREP_EXCLUDE_DIRS = ["node_modules", ".turbo", "coverage", "artifacts"];
const SYFT_EXCLUDE_DIRS = FS_EXCLUDE_DIRS.map((dir) => `./${dir}`);
const SEMGREP_BLOCKING_SEVERITIES = [];
const SEMGREP_REPORT_ONLY_SEVERITIES = ["ERROR"];

function rel(path) {
  return relative(repoRoot, path);
}

function trimmedOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: trimmedOutput(result.stdout),
    stderr: trimmedOutput(result.stderr),
  };
}

function ensureJsonFile(name, fallback) {
  const path = join(outDir, name);
  if (!existsSync(path)) {
    writeFileSync(path, `${JSON.stringify(fallback, null, 2)}\n`);
  }
}

function optionPairs(option, values) {
  return values.flatMap((value) => [option, value]);
}

function words(value) {
  return value.split(" ");
}

function stepOutputPaths(name, options) {
  return {
    stdoutPath: options.stdoutFile ? join(outDir, options.stdoutFile) : null,
    stderrPath: options.stderrFile
      ? join(outDir, options.stderrFile)
      : join(outDir, `${name}.stderr.txt`),
  };
}

function spawnStepCommand(command, commandArgs, options) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: 100 * 1024 * 1024,
  });
}

function writeOrForwardOutput(output, path, stream) {
  if (path) {
    writeFileSync(path, output);
    return;
  }
  if (output) {
    stream.write(output);
  }
}

function writeStepOutputs(result, paths) {
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  writeOrForwardOutput(stdout, paths.stdoutPath, process.stdout);
  writeOrForwardOutput(stderr, paths.stderrPath, process.stderr);
}

function recordStep({ name, command, commandArgs, result, paths }) {
  const status = result.status ?? 1;
  const step = {
    name,
    command: [command, ...commandArgs],
    status,
    signal: result.signal ?? null,
    stdout: paths.stdoutPath ? rel(paths.stdoutPath) : null,
    stderr: paths.stderrPath ? rel(paths.stderrPath) : null,
  };
  steps.push(step);
  return step;
}

function logStepFailure(step) {
  if (step.status !== 0) {
    console.error(`[security] ${step.name} failed with exit code ${step.status}`);
  }
}

function runStep(name, command, commandArgs, options = {}) {
  const paths = stepOutputPaths(name, options);
  console.log(`\n[security] ${name}: ${[command, ...commandArgs].join(" ")}`);

  const result = spawnStepCommand(command, commandArgs, options);
  writeStepOutputs(result, paths);
  const step = recordStep({ name, command, commandArgs, result, paths });
  logStepFailure(step);
  return step.status;
}

function runStdoutStep(name, command, commandArgs, stdoutFile) {
  runStep(name, command, commandArgs, { stdoutFile });
}

function runPolicyStep(name, status, details) {
  steps.push({
    name,
    command: [],
    status,
    signal: null,
    stdout: null,
    stderr: null,
    details,
  });
  if (status !== 0) {
    console.error(`[security] ${name} failed`);
  }
}

function semgrepSeverity(result) {
  const severity = result?.extra?.severity;
  return typeof severity === "string" && severity.length > 0 ? severity : "UNKNOWN";
}

function semgrepFindingSummary(result) {
  return {
    check_id: typeof result?.check_id === "string" ? result.check_id : "unknown",
    severity: semgrepSeverity(result),
    path: typeof result?.path === "string" ? result.path : "unknown",
    line: typeof result?.start?.line === "number" ? result.start.line : null,
    message: typeof result?.extra?.message === "string" ? result.extra.message : "",
  };
}

function countBy(values, keyFn) {
  const counts = new Map();
  for (const value of values) {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function formatCounts(counts) {
  return counts.length > 0 ? counts.map(([key, count]) => `${key}=${count}`).join(", ") : "none";
}

function logSemgrepPolicySummary({ findings, blockingFindings, reportOnlyFindings }) {
  console.log(
    `[security] semgrep-policy: ${findings.length} finding(s), ${blockingFindings.length} blocking, ${reportOnlyFindings.length} report-only.`,
  );
  console.log(
    `[security] semgrep-policy: blocking severities: ${SEMGREP_BLOCKING_SEVERITIES.join(", ") || "none"}.`,
  );
  console.log(
    `[security] semgrep-policy: report-only severities: ${SEMGREP_REPORT_ONLY_SEVERITIES.join(", ") || "none"}.`,
  );
  console.log(
    `[security] semgrep-policy: findings by severity: ${formatCounts(
      countBy(findings, (finding) => finding.severity),
    )}.`,
  );
  console.log(
    `[security] semgrep-policy: findings by check: ${formatCounts(
      countBy(findings, (finding) => finding.check_id),
    )}.`,
  );

  if (findings.length === 0) {
    return;
  }

  console.log("[security] semgrep-policy: metadata-only finding list follows:");
  for (const finding of findings) {
    const location = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
    console.log(
      `[security] semgrep-policy: ${finding.severity} ${finding.check_id} ${location} - ${finding.message}`,
    );
  }
}

function writeAttestation(finishedAt = null) {
  const versions = {
    node: capture("node", ["--version"]),
    pnpm: capture("pnpm", ["--version"]),
    gitleaks: capture("gitleaks", ["version"]),
    checkov: capture("checkov", ["--version"]),
    trivy: capture("trivy", ["--version"]),
    syft: capture("syft", ["version"]),
    grype: capture("grype", ["version"]),
    semgrep: capture("semgrep", ["--version"]),
  };
  const git = {
    commit: capture("git", ["rev-parse", "HEAD"]).stdout,
    branch: capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout,
    status: capture("git", ["status", "--short"]).stdout,
  };
  const failed = steps.filter((step) => step.status !== 0);
  const attestation = {
    schema_version: 1,
    started_at: startedAt,
    finished_at: finishedAt,
    repo_root: repoRoot,
    git,
    policy: {
      dependency_vulnerability_threshold: "moderate/medium",
      checkov_framework: "github_actions",
      semgrep_config: "auto",
      semgrep_blocking_severities: SEMGREP_BLOCKING_SEVERITIES,
      semgrep_report_only_severities: SEMGREP_REPORT_ONLY_SEVERITIES,
      trivy_scanners: "vuln,misconfig",
      gitleaks_scope: "current HEAD history",
    },
    tools: versions,
    steps,
    passed: finishedAt ? failed.length === 0 : null,
    failed_steps: failed.map((step) => step.name),
  };
  writeFileSync(join(outDir, "attestation.json"), `${JSON.stringify(attestation, null, 2)}\n`);
}

writeAttestation();

runStep("gitleaks", "bash", ["scripts/ci/gitleaks-detect.sh", "git"], {
  env: { GITLEAKS_LOG_OPTS: "HEAD", GITLEAKS_REPORT_PATH: join(outDir, "gitleaks.json") },
});
ensureJsonFile("gitleaks.json", []);

runStdoutStep(
  "pnpm-audit",
  "pnpm",
  ["audit", "--audit-level", "moderate", "--json"],
  "pnpm-audit.json",
);

runStdoutStep(
  "checkov-github-actions",
  "checkov",
  words("-d .github --framework github_actions --quiet --compact --output json"),
  "checkov-github-actions.json",
);
ensureJsonFile("checkov-github-actions.json", {});

runStep("trivy", "trivy", [
  ...words(
    "fs --scanners vuln,misconfig --include-dev-deps --severity MEDIUM,HIGH,CRITICAL --format json",
  ),
  "--output",
  join(outDir, "trivy.json"),
  "--exit-code",
  "1",
  "--skip-version-check",
  ...optionPairs("--skip-dirs", FS_EXCLUDE_DIRS),
  ".",
]);
ensureJsonFile("trivy.json", {});

runStep("syft", "syft", [
  "dir:.",
  "-o",
  `cyclonedx-json=${join(outDir, "insecur.sbom.cdx.json")}`,
  ...optionPairs("--exclude", SYFT_EXCLUDE_DIRS),
]);

runStep("grype", "grype", [
  `sbom:${join(outDir, "insecur.sbom.cdx.json")}`,
  "-o",
  "json",
  "--file",
  join(outDir, "grype.json"),
  "--fail-on",
  "medium",
]);
ensureJsonFile("grype.json", {});

runStep("semgrep", "semgrep", [
  ...words("scan --config auto --json --output"),
  join(outDir, "semgrep.json"),
  ...optionPairs("--exclude", SEMGREP_EXCLUDE_DIRS),
  ".",
]);
ensureJsonFile("semgrep.json", {});

const semgrepReport = JSON.parse(readFileSync(join(outDir, "semgrep.json"), "utf8"));
const semgrepResults = Array.isArray(semgrepReport.results) ? semgrepReport.results : [];
const acceptedSemgrepPolicyDeviations = [
  {
    check_id_suffix: "dependabot-missing-cooldown",
    rationale:
      "ADR-0056 intentionally uses a 3-day Dependabot cooldown aligned with pnpm minimumReleaseAge: 4320.",
  },
  {
    check_id_suffix: "pnpm-minimum-release-age",
    rationale:
      "ADR-0056 intentionally uses minimumReleaseAge: 4320 (3 days), not Semgrep's 7-day default.",
  },
];
function isAcceptedSemgrepDeviation(finding) {
  return acceptedSemgrepPolicyDeviations.some((entry) =>
    finding.check_id.endsWith(entry.check_id_suffix),
  );
}
const semgrepFindings = semgrepResults.map(semgrepFindingSummary);
const semgrepBlocking = semgrepFindings.filter(
  (finding) =>
    SEMGREP_BLOCKING_SEVERITIES.includes(finding.severity) && !isAcceptedSemgrepDeviation(finding),
);
const semgrepReportOnly = semgrepFindings.filter((finding) =>
  SEMGREP_REPORT_ONLY_SEVERITIES.includes(finding.severity),
);
logSemgrepPolicySummary({
  findings: semgrepFindings,
  blockingFindings: semgrepBlocking,
  reportOnlyFindings: semgrepReportOnly,
});
writeFileSync(
  join(outDir, "semgrep-policy.json"),
  `${JSON.stringify(
    {
      blocking_severities: SEMGREP_BLOCKING_SEVERITIES,
      report_only_severities: SEMGREP_REPORT_ONLY_SEVERITIES,
      accepted_deviations: acceptedSemgrepPolicyDeviations,
      finding_count: semgrepResults.length,
      accepted_count: semgrepFindings.filter(isAcceptedSemgrepDeviation).length,
      report_only_count: semgrepReportOnly.length,
      blocking_count: semgrepBlocking.length,
      findings: semgrepFindings,
      report_only_findings: semgrepReportOnly,
      blocking_findings: semgrepBlocking,
    },
    null,
    2,
  )}\n`,
);
runPolicyStep("semgrep-policy", semgrepBlocking.length === 0 ? 0 : 1, {
  finding_count: semgrepResults.length,
  blocking_count: semgrepBlocking.length,
});

writeAttestation(new Date().toISOString());

const failed = steps.filter((step) => step.status !== 0);
if (failed.length > 0) {
  console.error(
    `[security] ${failed.length} security attestation step(s) failed: ${failed.map((step) => step.name).join(", ")}`,
  );
  process.exit(1);
}

console.log(`[security] attestation passed; reports written to ${rel(outDir)}`);
