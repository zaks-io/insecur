import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const baselinePath = join(root, "config", "mutation-ratchet.json");
const reportPath = join(root, "reports", "mutation", "mutation.json");
const command = process.argv[2] ?? "check";
const scoreTolerance = 0.01;

if (command === "check") {
  checkBaseline();
} else if (command === "update") {
  updateBaseline();
} else {
  console.error("Usage: node scripts/ci/mutation-ratchet.mjs <check|update>");
  process.exit(2);
}

function checkBaseline() {
  const baseline = readBaseline();
  const current = readCurrentMetrics();
  const failures = [];

  compareMetric("overall", current.overall, baseline.overall, failures);

  for (const [area, expected] of Object.entries(baseline.areas ?? {})) {
    const actual = current.areas[area];
    if (actual === undefined) {
      failures.push(`${area}: missing from current mutation report`);
      continue;
    }
    compareMetric(area, actual, expected, failures);
  }

  for (const area of Object.keys(current.areas)) {
    if (baseline.areas?.[area] === undefined) {
      failures.push(`${area}: missing from mutation baseline`);
    }
  }

  if (failures.length > 0) {
    console.error("Mutation ratchet failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      `Run pnpm mutation:review to refresh the report, or pnpm mutation:baseline:update after accepting an intentional new baseline.`,
    );
    process.exit(1);
  }

  console.log(
    `Mutation ratchet passed: overall ${formatScore(current.overall.score)} >= ${formatScore(
      baseline.overall.score,
    )}, ${Object.keys(baseline.areas ?? {}).length} area floor(s) checked.`,
  );
}

function updateBaseline() {
  const current = readCurrentMetrics();
  const baseline = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: relative(root, reportPath),
    scope: {
      excluded: ["packages/cli"],
      note: "Manual Stryker baseline. CLI is excluded until its HOME-dependent tests are Stryker-runner-safe.",
    },
    overall: current.overall,
    areas: current.areas,
  };

  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(
    `Updated ${relative(root, baselinePath)}: overall ${formatScore(current.overall.score)} across ${current.overall.mutants} mutant(s).`,
  );
}

function readBaseline() {
  if (!existsSync(baselinePath)) {
    console.error(`Missing mutation baseline: ${relative(root, baselinePath)}`);
    console.error("Run pnpm mutation:review && pnpm mutation:baseline:update to create it.");
    process.exit(1);
  }
  return readJson(baselinePath);
}

function readCurrentMetrics() {
  if (!existsSync(reportPath)) {
    console.error(`Missing Stryker report: ${relative(root, reportPath)}`);
    console.error("Run pnpm mutation:review first.");
    process.exit(1);
  }

  const report = readJson(reportPath);
  const fileEntries = Object.entries(report.files ?? {});
  const overallCounters = emptyCounters();
  const areaCounters = new Map();

  for (const [filePath, fileReport] of fileEntries) {
    const area = areaName(filePath);
    const counters = areaCounters.get(area) ?? emptyCounters();

    for (const mutant of fileReport.mutants ?? []) {
      addMutant(overallCounters, mutant);
      addMutant(counters, mutant);
    }

    areaCounters.set(area, counters);
  }

  return {
    overall: toMetric(overallCounters),
    areas: Object.fromEntries(
      [...areaCounters.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([area, counters]) => [area, toMetric(counters)]),
    ),
  };
}

function addMutant(counters, mutant) {
  counters.mutants += 1;
  switch (mutant.status) {
    case "Killed":
      counters.killed += 1;
      return;
    case "Survived":
      counters.survived += 1;
      return;
    case "NoCoverage":
      counters.noCoverage += 1;
      return;
    case "Timeout":
      counters.timeout += 1;
      return;
    case "Ignored":
      counters.ignored += 1;
      return;
    default:
      counters.other += 1;
  }
}

function compareMetric(label, actual, expected, failures) {
  if (actual.score + scoreTolerance < expected.score) {
    failures.push(
      `${label}: score ${formatScore(actual.score)} fell below baseline ${formatScore(expected.score)}`,
    );
  }
}

function areaName(filePath) {
  const parts = filePath.split("/");
  if ((parts[0] === "apps" || parts[0] === "packages") && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? filePath;
}

function emptyCounters() {
  return {
    mutants: 0,
    killed: 0,
    survived: 0,
    noCoverage: 0,
    timeout: 0,
    ignored: 0,
    other: 0,
  };
}

function toMetric(counters) {
  return {
    score: score(counters),
    mutants: counters.mutants,
    killed: counters.killed,
    survived: counters.survived,
    noCoverage: counters.noCoverage,
    timeout: counters.timeout,
    ignored: counters.ignored,
    other: counters.other,
  };
}

function score(counters) {
  if (counters.mutants === 0) {
    return 100;
  }
  return Math.floor((counters.killed * 10000) / counters.mutants) / 100;
}

function formatScore(value) {
  return `${value.toFixed(2)}%`;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Could not read ${relative(root, filePath)}: ${error.message}`);
    process.exit(1);
  }
}
