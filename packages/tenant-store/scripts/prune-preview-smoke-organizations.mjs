#!/usr/bin/env node
/**
 * Deletes the organizations earlier preview smoke runs left behind. Every smoke run onboards fresh
 * personal organizations for the smoke users and never removes them, so the shared preview branch
 * accumulates tenants and the backup export (one transaction per organization, every tenant table)
 * outgrows the scheduled Worker's wall-clock limit. Runs before the smoke so the export covers only
 * the organizations the current run creates.
 *
 * An organization is a smoke leftover when it has memberships and every member is a smoke user.
 * The recovery canary and organizations with any other member (a real operator's tenant) stay.
 */
import postgres from "postgres";
import { requireDatabaseUrl, requireEnv } from "./lib/env-local.mjs";

// Keep in sync with packages/preview-smoke/src/preview-smoke-no-scope-actor.ts
const PREVIEW_SMOKE_NO_SCOPE_ADMITTED_USER_ID = "usr_0000000000000000000000SMK3";
// Keep in sync with RECOVERY_CANARY_ORGANIZATION_ID in packages/domain/src/recovery-canary-scope.ts
const RECOVERY_CANARY_ORGANIZATION_ID = "org_01RCAN00000000000000000001";

const databaseUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
const smokeUserIds = [
  requireEnv("SMOKE_ADMITTED_USER_ID"),
  requireEnv("SMOKE_INVITEE_ADMITTED_USER_ID"),
  process.env.SMOKE_NO_SCOPE_ADMITTED_USER_ID ?? PREVIEW_SMOKE_NO_SCOPE_ADMITTED_USER_ID,
];

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  const result = await sql.begin(async (tx) => {
    // The migration role is NOBYPASSRLS; app.service='true' is the cross-organization gate
    // (ADR-0037) that lets one statement reach every smoke tenant.
    await tx`SELECT set_config('app.service', 'true', true)`;

    const organizationIds = await selectSmokeOrganizationIds(tx);
    if (organizationIds.includes(RECOVERY_CANARY_ORGANIZATION_ID)) {
      throw new Error("preview smoke prune selected the recovery canary organization");
    }
    if (organizationIds.length === 0) {
      return { deletedRowsByTable: {}, organizationIds };
    }

    const deletedRowsByTable = await deleteOrganizations(tx, organizationIds);
    if (deletedRowsByTable.organizations !== organizationIds.length) {
      throw new Error(
        `preview smoke prune deleted ${String(deletedRowsByTable.organizations)} of ${String(organizationIds.length)} organizations`,
      );
    }
    return { deletedRowsByTable, organizationIds };
  });

  process.stdout.write(
    JSON.stringify({
      ok: true,
      prunedOrganizationCount: result.organizationIds.length,
      deletedRowsByTable: result.deletedRowsByTable,
    }) + "\n",
  );
} finally {
  await sql.end({ timeout: 5 });
}

async function selectSmokeOrganizationIds(tx) {
  const rows = await tx`
    SELECT o.id
    FROM organizations o
    WHERE o.id <> ${RECOVERY_CANARY_ORGANIZATION_ID}
      AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = o.id)
      AND NOT EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = o.id AND m.user_id <> ALL(${smokeUserIds})
      )
    ORDER BY o.id
  `;
  return rows.map((row) => row.id);
}

/**
 * Deletes the organizations and every row of every public table carrying `org_id` (the tenant-owned
 * marker, see org-id-rls-conformance.ts) in one statement. The tenant tables reference each other
 * in cycles (secrets <-> secret_versions, policies <-> policy versions), so no per-table order can
 * satisfy their NO ACTION foreign keys; data-modifying CTEs run as one statement and Postgres checks
 * those keys once at its end. The table list comes from the live catalog so a new tenant table is
 * pruned without touching this script; a table that references tenant rows without carrying
 * `org_id` surfaces as a foreign-key violation.
 */
async function deleteOrganizations(tx, organizationIds) {
  const tenantTables = (
    await tx`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'org_id'
      ORDER BY table_name
    `
  ).map((row) => row.table_name);

  const deletes = tenantTables.map(
    (table, index) =>
      `d${String(index)} AS (DELETE FROM ${quoteIdentifier(table)} WHERE org_id = ANY($1) RETURNING 1)`,
  );
  deletes.push("d_organizations AS (DELETE FROM organizations WHERE id = ANY($1) RETURNING 1)");
  const counts = tenantTables.map(
    (table, index) =>
      `SELECT ${quoteLiteral(table)} AS table_name, (SELECT count(*) FROM d${String(index)})::int AS deleted`,
  );
  counts.push("SELECT 'organizations', (SELECT count(*) FROM d_organizations)::int");

  const rows = await tx.unsafe(`WITH ${deletes.join(", ")} ${counts.join(" UNION ALL ")}`, [
    organizationIds,
  ]);
  return Object.fromEntries(rows.map((row) => [row.table_name, row.deleted]));
}

function quoteIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
