import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const baselinePath = join(root, "config", "mutation-ratchet.json");
const reportPath = join(root, "reports", "mutation", "mutation.json");
const command = process.argv[2] ?? "check";
const areaFilter = process.argv[3];
const scoreTolerance = 0.01;

if (command === "check") {
  checkBaseline(areaFilter);
} else if (command === "update") {
  updateBaseline();
} else if (command === "update-area") {
  if (areaFilter === undefined) {
    console.error("Usage: node scripts/ci/mutation-ratchet.mjs update-area <area>");
    process.exit(2);
  }
  updateAreaBaseline(areaFilter);
} else {
  console.error("Usage: node scripts/ci/mutation-ratchet.mjs <check|update|update-area> [area]");
  process.exit(2);
}

function checkBaseline(onlyArea) {
  const baseline = readBaseline();
  const current = readCurrentMetrics({ area: onlyArea, productionSourceOnly: true });
  const failures = [];

  if (onlyArea === undefined) {
    compareMetric("overall", current.overall, baseline.overall, failures);
  }

  const areasToCheck =
    onlyArea === undefined
      ? Object.entries(baseline.areas ?? {})
      : [[onlyArea, baseline.areas?.[onlyArea]]];

  for (const [area, expected] of areasToCheck) {
    if (expected === undefined) {
      failures.push(`${area}: missing from mutation baseline`);
      continue;
    }
    const actual = current.areas[area];
    if (actual === undefined) {
      failures.push(`${area}: missing from current mutation report`);
      continue;
    }
    compareMetric(area, actual, expected, failures);
  }

  if (onlyArea === undefined) {
    for (const area of Object.keys(current.areas)) {
      if (baseline.areas?.[area] === undefined) {
        failures.push(`${area}: missing from mutation baseline`);
      }
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

  if (onlyArea !== undefined) {
    console.log(
      `Mutation ratchet passed for ${onlyArea}: ${formatScore(current.areas[onlyArea].score)} >= ${formatScore(
        baseline.areas[onlyArea].score,
      )}.`,
    );
    return;
  }

  console.log(
    `Mutation ratchet passed: overall ${formatScore(current.overall.score)} >= ${formatScore(
      baseline.overall.score,
    )}, ${Object.keys(baseline.areas ?? {}).length} area floor(s) checked.`,
  );
}

function updateAreaBaseline(area) {
  const baseline = readBaseline();
  const report = readJson(reportPath);
  assertCompleteAreaReport(area, report);
  const current = readCurrentMetrics({ area, productionSourceOnly: true });
  const nextMetric = current.areas[area];
  if (nextMetric === undefined) {
    console.error(`${area}: missing from current mutation report`);
    process.exit(1);
  }

  const nextAreas = {
    ...(baseline.areas ?? {}),
    [area]: nextMetric,
  };
  const overallCounters = emptyCounters();
  for (const counters of Object.values(nextAreas).map(areaMetricToCounters)) {
    mergeCounters(overallCounters, counters);
  }

  const nextBaseline = {
    ...baseline,
    updatedAt: new Date().toISOString(),
    source: relative(root, reportPath),
    overall: toMetric(overallCounters),
    areas: nextAreas,
  };

  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`, "utf8");
  console.log(
    `Updated ${relative(root, baselinePath)} area ${area}: ${formatScore(nextMetric.score)} across ${nextMetric.mutants} mutant(s); overall ${formatScore(nextBaseline.overall.score)}.`,
  );
}

function updateBaseline() {
  const current = readCurrentMetrics();
  const baseline = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: relative(root, reportPath),
    scope: {
      excluded: [],
      note: "Manual Stryker baseline including CLI after INS-261 HOME/config isolation.",
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

function readCurrentMetrics(options = {}) {
  const { area: areaFilter, productionSourceOnly = false } = options;
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
    if (productionSourceOnly && isTestFile(filePath)) {
      continue;
    }
    const area = areaName(filePath);
    if (areaFilter !== undefined && area !== areaFilter) {
      continue;
    }
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

function isTestFile(filePath) {
  return filePath.includes(".test.") || filePath.includes(".spec.");
}

function listProductionSourceFiles(area) {
  const areaPath = join(root, ...area.split("/"));
  if (!existsSync(areaPath)) {
    console.error(`${area}: area path does not exist (${relative(root, areaPath)})`);
    process.exit(1);
  }

  const files = [];
  walkProductionSources(areaPath, files);
  return files.sort();
}

function walkProductionSources(directoryPath, files) {
  for (const entry of readdirSync(directoryPath)) {
    const fullPath = join(directoryPath, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkProductionSources(fullPath, files);
      continue;
    }
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts") || isTestFile(entry)) {
      continue;
    }
    files.push(relative(root, fullPath).replaceAll("\\", "/"));
  }
}

function assertCompleteAreaReport(area, report) {
  const expectedFiles = listProductionSourceFiles(area);
  const reportFiles = Object.keys(report.files ?? {});
  const missingFiles = expectedFiles.filter((filePath) => !reportFiles.includes(filePath));
  if (missingFiles.length > 0) {
    console.error(
      `${area}: mutation report is partial; missing ${missingFiles.length} production file(s):`,
    );
    for (const filePath of missingFiles.slice(0, 10)) {
      console.error(`- ${filePath}`);
    }
    if (missingFiles.length > 10) {
      console.error(`- ...and ${missingFiles.length - 10} more`);
    }
    console.error(
      `Run a focused review that covers all production sources under ${area}, for example: pnpm exec stryker run --mutate "${area}/src/**/*.ts"`,
    );
    process.exit(1);
  }
}

function areaMetricToCounters(metric) {
  return {
    mutants: metric.mutants,
    killed: metric.killed,
    survived: metric.survived,
    noCoverage: metric.noCoverage,
    timeout: metric.timeout,
    ignored: metric.ignored,
    other: metric.other,
  };
}

function mergeCounters(target, source) {
  target.mutants += source.mutants;
  target.killed += source.killed;
  target.survived += source.survived;
  target.noCoverage += source.noCoverage;
  target.timeout += source.timeout;
  target.ignored += source.ignored;
  target.other += source.other;
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
