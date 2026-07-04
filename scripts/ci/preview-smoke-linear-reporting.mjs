#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { ISSUE_SEARCH_QUERY, LinearClient } from "./security-daily-linear-client.mjs";

const DEFAULT_LABELS = ["Bug"];

async function main() {
  if (process.env.LINEAR_PREVIEW_SMOKE_REPORTING_ENABLED !== "true") {
    console.log(
      "::notice::Linear preview smoke reporting skipped: set LINEAR_PREVIEW_SMOKE_REPORTING_ENABLED=true and configure LINEAR_API_KEY to file failures.",
    );
    return;
  }

  const config = reportingConfig();
  const evidence = await readEvidence(config.evidencePath);
  const failure = failureFromEvidence(evidence);
  const client = new LinearClient(config.apiKey);
  const { teamId, labelIds } = await client.resolveTeamAndLabels(config.teamKey, config.labels);
  const marker = markerFor(failure.checkId);
  const existing = await findIssueByMarker(client, marker, teamId);
  const input = issueInput({ config, evidence, failure, labelIds, marker });

  if (existing) {
    await client.updateIssue(existing.id, input);
    console.log(`updated Linear preview smoke issue for ${failure.checkId}`);
    return;
  }

  await client.createIssue(teamId, input);
  console.log(`created Linear preview smoke issue for ${failure.checkId}`);
}

function reportingConfig() {
  return {
    apiKey: requiredEnv("LINEAR_API_KEY"),
    evidencePath: process.env.PREVIEW_SMOKE_EVIDENCE_PATH ?? "preview-smoke-evidence/evidence.json",
    labels: labelsFromEnv(),
    repository: process.env.GITHUB_REPOSITORY ?? "zaks-io/insecur",
    sha: process.env.GITHUB_SHA ?? "unknown",
    teamKey: process.env.LINEAR_TEAM_KEY ?? "INS",
    workflowUrl: workflowUrl(),
  };
}

function labelsFromEnv() {
  const raw = process.env.LINEAR_PREVIEW_SMOKE_LABELS;
  return raw
    ? raw
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean)
    : DEFAULT_LABELS;
}

async function readEvidence(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function failureFromEvidence(evidence) {
  if (evidence?.failure?.checkId) {
    return {
      checkId: safeText(evidence.failure.checkId, "preview-smoke.unknown"),
      message: safeText(evidence.failure.message, "Preview smoke failed."),
    };
  }
  return {
    checkId: "workflow.deploy-preview",
    message: "Deploy Preview failed before preview smoke evidence was written.",
  };
}

async function findIssueByMarker(client, marker, teamId) {
  const data = await client.request(ISSUE_SEARCH_QUERY, {
    filter: {
      searchableContent: { contains: marker },
      team: { id: { eq: teamId } },
    },
  });
  return data.issues.nodes.find((issue) => issue.description?.includes(marker)) ?? null;
}

function issueInput({ config, evidence, failure, labelIds, marker }) {
  return {
    title: truncate(`[preview-smoke] ${failure.checkId} failed`, 120),
    description: issueDescription({ config, evidence, failure, marker }),
    labelIds,
  };
}

function issueDescription({ config, evidence, failure, marker }) {
  const checked = Array.isArray(evidence?.checks)
    ? evidence.checks
        .filter((check) => check.status !== "pending")
        .map((check) => `- ${safeText(check.status, "unknown")}: ${safeText(check.id, "unknown")}`)
        .join("\n")
    : "- no smoke evidence artifact";

  return [
    "Automated metadata-only preview smoke failure report.",
    "",
    `Fingerprint: \`${marker}\``,
    "",
    `- Path: ${failure.checkId}`,
    `- Sanitized error: ${failure.message}`,
    `- SHA: ${safeText(evidence?.sha ?? config.sha, "unknown")}`,
    `- Workflow: ${safeText(evidence?.workflowUrl ?? config.workflowUrl, "workflow URL unavailable")}`,
    `- Repository: ${safeText(config.repository, "repository unavailable")}`,
    "",
    "Checked paths:",
    checked,
    "",
    "Safety: this issue intentionally excludes raw secrets, session cookies, bearer credentials,",
    "sentinel values, environment variables, and smoke database URLs.",
  ].join("\n");
}

function markerFor(checkId) {
  const fingerprint = createHash("sha256").update(`preview-smoke:${checkId}`).digest("hex");
  return `insecur-preview-smoke:${fingerprint}`;
}

function workflowUrl() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) {
    return "workflow URL unavailable";
  }
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

function safeText(value, fallback) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  if (!text) {
    return fallback;
  }
  return truncate(text.replace(/[^\w .:/@%#?=&,+[\]()-]/gu, ""), 500);
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when LINEAR_PREVIEW_SMOKE_REPORTING_ENABLED=true`);
  }
  return value;
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
