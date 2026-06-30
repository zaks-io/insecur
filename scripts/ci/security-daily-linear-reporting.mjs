#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildMetadataReport,
  dedupeFindings,
  validateMetadataOnly,
} from "./security-daily-linear-reporting-lib.mjs";
import { LinearClient } from "./security-daily-linear-client.mjs";
import { issueDescription, issueTitle } from "./security-daily-linear-format.mjs";

const DEFAULT_LABELS = ["zaks-io/insecur", "risk-security-sensitive", "Bug"];

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command?.startsWith("summarize-")) {
    await summarize(command.replace("summarize-", ""), args);
    return;
  }
  if (command === "report") {
    await reportCriticals();
    return;
  }
  throw new Error("usage: security-daily-linear-reporting.mjs summarize-{scanner}|report");
}

async function summarize(scanner, args) {
  const options = parseOptions(args);
  requireOption(options.input, "--input");
  requireOption(options.output, "--output");
  const rawReport = await readJson(options.input);
  const report = buildMetadataReport(scanner, rawReport, {
    workflowUrl: options.workflowUrl,
    generatedAt: options.generatedAt,
  });
  validateMetadataOnly(report);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${report.findings.length} metadata-only ${scanner} finding(s)`);
}

async function reportCriticals() {
  if (process.env.LINEAR_SECURITY_REPORTING_ENABLED !== "true") {
    console.log(
      "::notice::Linear security reporting skipped: set LINEAR_SECURITY_REPORTING_ENABLED=true and configure LINEAR_API_KEY before enabling automated issue filing.",
    );
    return;
  }
  const config = reportingConfig();
  const findings = await loadFindingReports(config.reportDir);
  const client = new LinearClient(config.apiKey);
  const { teamId, labelIds } = await client.resolveTeamAndLabels(config.teamKey, config.labels);
  const results = await upsertFindings(client, findings, teamId, labelIds, config);
  console.log(`reported ${results.created} created, ${results.updated} updated Linear issue(s)`);
}

function reportingConfig() {
  const apiKey = requiredEnv("LINEAR_API_KEY");
  return {
    apiKey,
    labels: labelsFromEnv(),
    reportDir: process.env.SECURITY_DAILY_REPORT_DIR ?? "security-daily-findings",
    repository: requiredEnv("GITHUB_REPOSITORY"),
    teamKey: process.env.LINEAR_TEAM_KEY ?? "INS",
  };
}

function labelsFromEnv() {
  const rawLabels = process.env.LINEAR_SECURITY_REPORTING_LABELS;
  return rawLabels ? rawLabels.split(",").map((label) => label.trim()) : DEFAULT_LABELS;
}

async function loadFindingReports(reportDir) {
  const files = (await readdir(reportDir)).filter((file) => file.endsWith(".json"));
  const reports = await Promise.all(files.map((file) => readJson(join(reportDir, file))));
  reports.forEach((report) => validateMetadataOnly(report));
  return dedupeFindings(reports.flatMap((report) => report.findings ?? []));
}

async function upsertFindings(client, findings, teamId, labelIds, config) {
  const results = { created: 0, updated: 0 };
  for (const finding of findings) {
    const existing = await client.findIssueByFingerprint(finding.fingerprint, teamId);
    const input = issueInput(finding, labelIds, config);
    if (existing) {
      await client.updateIssue(existing.id, input);
      results.updated += 1;
    } else {
      await client.createIssue(teamId, input);
      results.created += 1;
    }
  }
  return results;
}

function issueInput(finding, labelIds, config) {
  return {
    title: issueTitle(finding),
    description: issueDescription(finding, { repository: config.repository }),
    labelIds,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
      ?.replace(/^--/, "")
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    options[key] = args[index + 1];
  }
  return options;
}

function requireOption(value, name) {
  if (!value) {
    throw new Error(`missing required option ${name}`);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when LINEAR_SECURITY_REPORTING_ENABLED=true`);
  }
  return value;
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
