import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

function includesEvery(values, expected) {
  return expected.every((value) => values?.includes(value));
}

export function collectRenovateConformanceProblems(rootDir = REPO_ROOT) {
  const problems = [];
  const renovatePath = join(rootDir, "renovate.json");
  const ciPath = join(rootDir, ".github/workflows/ci.yml");

  for (const dependabotName of ["dependabot.yml", "dependabot.yaml"]) {
    if (existsSync(join(rootDir, ".github", dependabotName))) {
      problems.push(`.github/${dependabotName} must not generate a second dependency-update lane`);
    }
  }

  if (!existsSync(renovatePath)) {
    return [...problems, "renovate.json is missing"];
  }

  const config = JSON.parse(readFileSync(renovatePath, "utf8"));
  if (!config.extends?.includes("config:best-practices")) {
    problems.push("Renovate must extend config:best-practices");
  }
  if (config.prCreation !== "status-success") {
    problems.push("Renovate must create pull requests only after branch checks succeed");
  }
  if (config.prConcurrentLimit !== 1) {
    problems.push("Renovate must expose at most one pull request at a time");
  }
  if (config.configMigration !== false) {
    problems.push("Renovate config-migration pull requests must stay disabled");
  }
  if (!Number.isInteger(config.branchConcurrentLimit) || config.branchConcurrentLimit > 3) {
    problems.push("Renovate hidden-branch concurrency must be capped at three");
  }
  if (config.vulnerabilityAlerts?.prCreation !== "status-success") {
    problems.push("Renovate vulnerability fixes must also pass branch checks before PR creation");
  }
  if (config.vulnerabilityAlerts?.groupName !== "security fixes") {
    problems.push("Renovate vulnerability fixes must be grouped into one pull request");
  }

  const rules = config.packageRules ?? [];
  const npmQuarantine = rules.some(
    (rule) =>
      rule.matchDatasources?.includes("npm") &&
      rule.minimumReleaseAge === "3 days" &&
      rule.internalChecksFilter === "strict",
  );
  if (!npmQuarantine) {
    problems.push("Renovate npm updates must enforce the three-day release quarantine");
  }

  const actionsQuarantine = rules.some(
    (rule) =>
      rule.matchManagers?.includes("github-actions") &&
      rule.minimumReleaseAge === "3 days" &&
      rule.internalChecksFilter === "strict",
  );
  if (!actionsQuarantine) {
    problems.push("Renovate GitHub Actions updates must enforce the three-day release quarantine");
  }

  const routineAutomerge = rules.some(
    (rule) =>
      rule.automerge === true &&
      includesEvery(rule.matchUpdateTypes, ["minor", "patch", "digest", "pinDigest"]),
  );
  if (!routineAutomerge) {
    problems.push("Renovate routine non-major updates must automerge after checks pass");
  }

  const majorApproval = rules.some(
    (rule) =>
      rule.matchUpdateTypes?.includes("major") &&
      rule.dependencyDashboardApproval === true &&
      rule.automerge === false,
  );
  if (!majorApproval) {
    problems.push("Renovate major updates must require Dependency Dashboard approval");
  }

  if (!existsSync(ciPath)) {
    problems.push(".github/workflows/ci.yml is missing");
  } else {
    const ci = YAML.parse(readFileSync(ciPath, "utf8"));
    const pushBranches = ci.on?.push?.branches ?? [];
    if (!pushBranches.includes("renovate/**")) {
      problems.push("CI must run on hidden renovate/** branches");
    }
  }

  return problems;
}

export function assertRenovateConformance(rootDir = REPO_ROOT) {
  const problems = collectRenovateConformanceProblems(rootDir);
  if (problems.length > 0) {
    throw new Error(`Renovate conformance failed:\n- ${problems.join("\n- ")}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertRenovateConformance();
  console.log("Renovate conformance passed.");
}
