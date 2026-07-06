import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createCoverageMap } = require("istanbul-lib-coverage");
const libReport = require("istanbul-lib-report");
const reports = require("istanbul-reports");

const root = fileURLToPath(new URL("..", import.meta.url));
const coverageDir = join(root, "coverage");
const workspaceDirs = ["apps", "packages"];
// Repo-wide floors for the merged DB-less unit suite. Raise as coverage climbs.
// Per-workspace coverage counts local unexecuted src files more strictly than the old root project run.
const thresholds = {
  branches: 62,
  functions: 75,
  lines: 74,
  statements: 74,
};

function formatPct(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function coverageBadgeColor(linesPct) {
  const threshold = thresholds.lines;
  if (linesPct < threshold) {
    return "red";
  }
  if (linesPct < threshold + 5) {
    return "yellow";
  }
  if (linesPct < 90) {
    return "yellowgreen";
  }
  return "brightgreen";
}

function coverageBadge(summary) {
  const linesPct = summary.lines.pct;
  return {
    schemaVersion: 1,
    label: "coverage",
    message: `${formatPct(linesPct)}% lines`,
    color: coverageBadgeColor(linesPct),
  };
}

function readWorkspaceCoverageReports() {
  const coverageReports = [];

  for (const workspaceDir of workspaceDirs) {
    const absoluteWorkspaceDir = join(root, workspaceDir);

    if (!existsSync(absoluteWorkspaceDir)) {
      continue;
    }

    for (const workspaceName of readdirSync(absoluteWorkspaceDir).sort()) {
      const packageJsonFile = join(absoluteWorkspaceDir, workspaceName, "package.json");

      if (!existsSync(packageJsonFile)) {
        continue;
      }

      const packageJson = JSON.parse(readFileSync(packageJsonFile, "utf8"));

      if (!packageJson.scripts?.["test:coverage"]) {
        continue;
      }

      const coverageFile = join(
        absoluteWorkspaceDir,
        workspaceName,
        "coverage",
        "coverage-final.json",
      );

      coverageReports.push({
        coverageFile,
        missing: !existsSync(coverageFile),
        workspacePath: join(workspaceDir, workspaceName),
      });
    }
  }

  return coverageReports;
}

const coverageReports = readWorkspaceCoverageReports();
const missingReports = coverageReports.filter((report) => report.missing);

if (coverageReports.length === 0) {
  console.error("No workspace coverage reports found.");
  process.exit(1);
}

if (missingReports.length > 0) {
  for (const report of missingReports) {
    console.error(`Missing coverage report for ${report.workspacePath}.`);
  }
  process.exit(1);
}

const coverageMap = createCoverageMap({});

for (const report of coverageReports) {
  const coverageJson = JSON.parse(readFileSync(report.coverageFile, "utf8"));
  coverageMap.merge(coverageJson);
}

rmSync(coverageDir, { force: true, recursive: true });
mkdirSync(coverageDir, { recursive: true });
writeFileSync(
  join(coverageDir, "coverage-final.json"),
  `${JSON.stringify(coverageMap.toJSON())}\n`,
);

const reportContext = libReport.createContext({
  coverageMap,
  dir: coverageDir,
});

reports.create("lcovonly").execute(reportContext);
reports.create("text-summary").execute(reportContext);

const summary = coverageMap.getCoverageSummary().toJSON();
writeFileSync(
  join(coverageDir, "coverage-summary.json"),
  `${JSON.stringify({ summary, thresholds }, null, 2)}\n`,
);
writeFileSync(
  join(coverageDir, "coverage-badge.json"),
  `${JSON.stringify(coverageBadge(summary), null, 2)}\n`,
);

const failures = Object.entries(thresholds).filter(([metric, threshold]) => {
  return summary[metric].pct < threshold;
});

for (const report of coverageReports) {
  console.log(`Merged ${relative(root, report.coverageFile)}`);
}

if (failures.length > 0) {
  for (const [metric, threshold] of failures) {
    console.error(
      `${metric} coverage ${summary[metric].pct}% is below the ${threshold}% threshold.`,
    );
  }
  process.exit(1);
}
