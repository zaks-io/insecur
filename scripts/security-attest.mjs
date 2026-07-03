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
const semgrepBlocking = semgrepResults.filter((result) => result.extra?.severity === "ERROR");
writeFileSync(
  join(outDir, "semgrep-policy.json"),
  `${JSON.stringify(
    {
      blocking_severities: ["ERROR"],
      finding_count: semgrepResults.length,
      blocking_count: semgrepBlocking.length,
      blocking_findings: semgrepBlocking.map((result) => ({
        check_id: result.check_id,
        path: result.path,
        line: result.start?.line,
        message: result.extra?.message,
      })),
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
