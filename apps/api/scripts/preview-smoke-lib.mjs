import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import postgres from "postgres";

export const HAPPY_PATH_MANIFEST = [
  ["deploy.identity.api", "API health serves deployed SHA"],
  ["deploy.identity.web", "Web health serves deployed SHA"],
  ["deploy.identity.site", "Site health serves deployed SHA"],
  ["site.root", "Public Site root renders launch page with noindex/security headers"],
  ["web.root", "Web BFF root renders"],
  ["web.whoami.unauth", "Web /whoami renders unauthenticated fallback"],
  ["web.whoami.auth", "Web /whoami proves authenticated BFF to API hop"],
  ["auth.cli.authorize.valid", "CLI PKCE authorize returns WorkOS redirect"],
  ["auth.cli.authorize.invalid", "CLI PKCE authorize rejects non-loopback redirect"],
  ["api.session.whoami", "Authenticated API /v1/session/whoami returns smoke actor"],
  ["onboarding.personal_organization", "Guided onboarding provisions org/project/team/env"],
  ["secrets.write", "Secret write succeeds through by-variable-key route"],
  ["runtime_injection.grant_issue", "Runtime Injection grant issue succeeds"],
  ["runtime_injection.grant_consume", "Runtime Injection grant consume returns generated value"],
  ["runtime_injection.grant_replay_reject", "Runtime Injection grant is one-use"],
  ["operations.poll", "Operation polling returns metadata-only status when an operation id exists"],
  ["organizations.create", "Instance-operator organization creation succeeds"],
  ["invitations.create", "Invitation creation succeeds"],
  ["invitations.accept", "Invitation acceptance succeeds for second smoke actor"],
  ["design_partner_feedback.submit", "Design-partner feedback accepts metadata-only record"],
  ["plaintext_sweep.postgres", "Preview Postgres plaintext sweep finds no sentinel"],
].map(([id, name]) => ({ id, name }));

const TEXTUAL_COLUMN_TYPES = new Set(["character", "character varying", "json", "jsonb", "text"]);

export class PreviewSmokeError extends Error {
  constructor(checkId, message, options = {}) {
    super(message);
    this.name = "PreviewSmokeError";
    this.checkId = checkId;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function mintSmokeSentinel() {
  const value = `insecur-smoke-${randomUUID()}-${randomBytes(32).toString("hex")}`;
  const bytes = Buffer.from(value, "utf8");
  const fingerprint = createHash("sha256").update(value).digest("hex");
  return {
    value,
    fingerprint,
    variants: [
      { encoding: "raw", pattern: value },
      { encoding: "base64", pattern: bytes.toString("base64") },
      { encoding: "base64url", pattern: bytes.toString("base64url") },
      { encoding: "hex", pattern: bytes.toString("hex") },
    ],
  };
}

export function createRedactor(patterns) {
  const ordered = [...new Set(patterns.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  return (value) => redactText(value, ordered);
}

export function redactText(value, patterns) {
  let text = String(value ?? "");
  for (const pattern of patterns) {
    text = text.split(pattern).join("[redacted]");
  }
  return text;
}

export function createManifestRun({
  sha,
  runId,
  workflowUrl,
  startedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    source: "deploy-preview",
    sha,
    runId,
    workflowUrl,
    startedAt,
    completedAt: null,
    checks: HAPPY_PATH_MANIFEST.map((check) => ({ ...check, status: "pending" })),
    identities: {},
    resources: {},
    plaintextSweep: null,
    failure: null,
  };
}

export function passCheck(run, id, evidence = {}) {
  updateCheck(run, id, { status: "passed", evidence });
}

export function skipCheck(run, id, reason) {
  updateCheck(run, id, { status: "skipped", reason });
}

export function failCheck(run, id, message) {
  updateCheck(run, id, { status: "failed", message });
  run.failure = { checkId: id, message };
}

export function completeManifestRun(run, completedAt = new Date().toISOString()) {
  run.completedAt = completedAt;
  return run;
}

export async function writeEvidenceArtifact(filePath, run) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`);
}

export async function appendGithubSummary(filePath, run) {
  if (!filePath) {
    return;
  }
  await writeFile(filePath, formatGithubSummary(run), { flag: "a" });
}

export function formatGithubSummary(run) {
  const status = run.failure === null ? "PASS" : "FAIL";
  const lines = [
    "## Preview Application Happy-Path Proof",
    "",
    `Status: ${status}`,
    `SHA: ${run.sha ?? "unknown"}`,
    `Workflow: ${run.workflowUrl ?? "unknown"}`,
    "",
    "### Worker identities",
    "",
    ...Object.entries(run.identities).map(
      ([key, identity]) =>
        `- ${key}: ${identity.service} ${identity.deploySha} run ${identity.runId} at ${identity.deployedAt}`,
    ),
    "",
    "### Resources",
    "",
    `- Organization: ${run.resources.organizationId ?? "n/a"}`,
    `- Project: ${run.resources.projectId ?? "n/a"}`,
    `- Environment: ${run.resources.environmentId ?? "n/a"}`,
    `- Grant: ${run.resources.grantId ?? "n/a"}`,
    "",
    "### Happy paths",
    "",
    ...run.checks.map((check) => `- ${check.status.toUpperCase()}: ${check.id} - ${check.name}`),
    "",
    "### Plaintext sweep",
    "",
    run.plaintextSweep
      ? `- Checked ${String(run.plaintextSweep.columnCount)} columns for raw/base64/base64url/hex sentinel variants: ${run.plaintextSweep.hitCount === 0 ? "PASS" : "FAIL"}`
      : "- Not run",
  ];
  if (run.failure !== null) {
    lines.push("", "### Failure", "", `- ${run.failure.checkId}: ${run.failure.message}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function listTextualColumns(sql) {
  const rows = await sql`
    SELECT table_name AS "tableName",
           column_name AS "columnName",
           data_type AS "dataType",
           udt_name AS "udtName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')
        OR udt_name IN ('text', 'varchar', 'bpchar', 'json', 'jsonb')
      )
    ORDER BY table_name, ordinal_position
  `;
  return rows.filter(isTextualColumn);
}

export async function runPlaintextSweep(databaseUrl, sentinel) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await enableServiceAccessScope(sql);
    const columns = await listTextualColumns(sql);
    const hits = await sweepPostgresColumns(sql, columns, sentinel);
    return {
      columnCount: columns.length,
      encodings: sentinel.variants.map((variant) => variant.encoding),
      hitCount: hits.length,
      hits,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function sweepPostgresColumns(sql, columns, sentinel) {
  const hits = [];
  for (const column of columns) {
    for (const variant of sentinel.variants) {
      if (await columnContainsPattern(sql, column.tableName, column.columnName, variant.pattern)) {
        hits.push({
          tableName: column.tableName,
          columnName: column.columnName,
          encoding: variant.encoding,
        });
      }
    }
  }
  return hits;
}

export function isTextualColumn(column) {
  return TEXTUAL_COLUMN_TYPES.has(column.dataType) || TEXTUAL_COLUMN_TYPES.has(column.udtName);
}

export function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

export function escapeLikePattern(pattern) {
  return pattern.replace(/\\/gu, "\\\\").replace(/%/gu, "\\%").replace(/_/gu, "\\_");
}

async function columnContainsPattern(sql, tableName, columnName, pattern) {
  const table = quoteIdentifier(tableName);
  const column = quoteIdentifier(columnName);
  const escaped = escapeLikePattern(pattern);
  const query = `SELECT 1 AS hit FROM ${table} WHERE ${column}::text LIKE $1 ESCAPE '\\' LIMIT 1`;
  const rows = await sql.unsafe(query, [`%${escaped}%`]);
  return rows.length > 0;
}

async function enableServiceAccessScope(sql) {
  await sql`SELECT set_config('app.service', ${"true"}, ${false})`;
}

function updateCheck(run, id, patch) {
  const check = run.checks.find((candidate) => candidate.id === id);
  if (!check) {
    throw new Error(`unknown preview smoke check: ${id}`);
  }
  Object.assign(check, patch);
}
