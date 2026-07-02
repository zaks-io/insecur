import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const outputDir = join(root, ".jscpd-report", "ci");
const reportPath = join(outputDir, "jscpd-report.json");
const failOnDuplicates = process.argv.includes("--fail-on-duplicates");

rmSync(outputDir, { recursive: true, force: true });

const result = spawnSync(
  "jscpd",
  [
    "--config",
    ".jscpd.json",
    "--threshold",
    "100",
    "--reporters",
    "json",
    "--output",
    outputDir,
    "--silent",
    "apps",
    "packages",
    "scripts",
  ],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.status !== 0) {
  warn("jscpd could not complete. Run pnpm duplicates:check locally.");
  process.exit(failOnDuplicates ? (result.status ?? 1) : 0);
}

if (!existsSync(reportPath)) {
  warn(`jscpd did not write ${reportPath}. Run pnpm duplicates:check locally.`);
  process.exit(failOnDuplicates ? 1 : 0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  warn(`jscpd wrote an unreadable report. Run pnpm duplicates:check locally. ${error.message}`);
  process.exit(failOnDuplicates ? 1 : 0);
}

const duplicates = Array.isArray(report.duplicates) ? report.duplicates : [];
const total = report.statistics?.total;

if (duplicates.length === 0) {
  console.log("jscpd found no duplicate code.");
  process.exit(0);
}

const percentage = typeof total?.percentage === "number" ? `${total.percentage}%` : "unknown";
warn(
  `jscpd found ${duplicates.length} duplicate code clone(s), ${percentage} duplicated lines. Agents must dedupe repeated logic before handoff or document why repetition is intentional.`,
);

for (const duplicate of duplicates) {
  warn(formatDuplicate(duplicate), duplicate.firstFile);
}

if (failOnDuplicates) {
  console.error("jscpd duplicate-code gate failed.");
  process.exit(1);
}

function formatDuplicate(duplicate) {
  const first = formatLocation(duplicate.firstFile);
  const second = formatLocation(duplicate.secondFile);
  const lines = Number.isFinite(duplicate.lines) ? `${duplicate.lines} lines` : "duplicate block";
  return `${lines}: ${first} duplicates ${second}`;
}

function formatLocation(file) {
  if (!file?.name) {
    return "unknown location";
  }
  return `${file.name}:${file.start ?? "?"}-${file.end ?? "?"}`;
}

function warn(message, file) {
  if (process.env.GITHUB_ACTIONS === "true") {
    const location = formatAnnotationLocation(file);
    console.log(`::warning${location}::${escapeAnnotationMessage(message)}`);
    return;
  }
  console.warn(`WARN ${message}`);
}

function formatAnnotationLocation(file) {
  if (!file?.name || !Number.isFinite(file.start)) {
    return "";
  }

  const properties = [`file=${escapeAnnotationProperty(file.name)}`, `line=${file.start}`];
  if (Number.isFinite(file.end)) {
    properties.push(`endLine=${file.end}`);
  }
  return ` ${properties.join(",")}`;
}

function escapeAnnotationMessage(message) {
  return message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeAnnotationProperty(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}
