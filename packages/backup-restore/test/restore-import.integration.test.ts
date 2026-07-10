import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { organizationId } from "@insecur/domain";
import { closeRuntimeSql, runWithRuntimeConnection, withTenantScope } from "@insecur/tenant-store";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  redactDatabaseUrlsInText,
  requireDatabaseUrl,
  unquoteEnvValue,
} from "../../tenant-store/scripts/lib/env-local.mjs";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import {
  BACKUP_RESTORE_ERROR_CODES,
  MemoryBackupExportStorage,
  RECOVERY_CANARY_ORGANIZATION_ID,
  buildBackupExportArtifactKey,
  buildBackupExportEvidenceKey,
  concatJsonlLines,
  encodeBackupJsonlLine,
  hashBackupArtifact,
  openBackupArtifact,
  parseBackupExportArtifactKey,
  parseBackupJsonlPayload,
  runBackupExport,
  runRestoreImport,
  sealBackupArtifact,
  type BackupExportRow,
  type BackupExportSuccessEvidence,
} from "../src/index.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const tenantStoreRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tenant-store");

function durableRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = (index * 11 + 29) % 256;
  }
  return root;
}

/**
 * Rewrites one org A `secrets` row's own `org_id` column to org B while leaving its
 * `organization_id` grouping key at A, so the importer still routes it into org A's scope where
 * the RLS WITH CHECK must reject the org-B org_id. Module-level so the test body stays flat.
 */
function crossTenantTamper(rows: BackupExportRow[]): BackupExportRow[] {
  let rewrote = false;
  const mutated = rows.map((row) => {
    if (
      !rewrote &&
      row.table === "secrets" &&
      row.organization_id === TEST_ORG_A_ID &&
      row.org_id === TEST_ORG_A_ID
    ) {
      rewrote = true;
      return { ...row, org_id: TEST_ORG_B_ID };
    }
    return row;
  });
  if (!rewrote) {
    throw new Error("fixture expected at least one org A secrets row to tamper");
  }
  return mutated;
}

function adminDatabaseUrl(): string {
  const superuser = unquoteEnvValue(process.env.INSECUR_POSTGRES_SUPERUSER ?? "");
  const password = unquoteEnvValue(process.env.INSECUR_POSTGRES_SUPERUSER_PASSWORD ?? "");
  const port = unquoteEnvValue(process.env.INSECUR_POSTGRES_PORT ?? "");
  if (!superuser || !password || !port) {
    throw new Error(
      "restore integration suite requires local Postgres superuser env (pnpm dev:db:reset)",
    );
  }
  return `postgres://${encodeURIComponent(superuser)}:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
}

function withDatabaseName(url: string, databaseName: string): string {
  const rewritten = new URL(url);
  rewritten.pathname = `/${databaseName}`;
  return rewritten.toString();
}

function migrationRoleName(): string {
  return new URL(requireDatabaseUrl("DATABASE_URL_MIGRATION")).username;
}

async function createScratchDatabase(databaseName: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl(), { prepare: false, max: 1 });
  try {
    await admin.unsafe(
      `CREATE DATABASE "${databaseName}" OWNER "${decodeURIComponent(migrationRoleName())}"`,
    );
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function dropScratchDatabase(databaseName: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl(), { prepare: false, max: 1 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

function migrateScratchDatabase(databaseName: string): void {
  const migrate = spawnSync("node", ["scripts/migrate.mjs"], {
    cwd: tenantStoreRoot,
    env: {
      ...process.env,
      DATABASE_URL: undefined,
      DATABASE_URL_MIGRATION: withDatabaseName(
        requireDatabaseUrl("DATABASE_URL_MIGRATION"),
        databaseName,
      ),
      DATABASE_URL_RUNTIME: withDatabaseName(
        requireDatabaseUrl("DATABASE_URL_RUNTIME"),
        databaseName,
      ),
    },
    encoding: "utf8",
  });
  if (migrate.status !== 0) {
    throw new Error(
      `scratch migrate failed: ${redactDatabaseUrlsInText(
        [migrate.stderr, migrate.stdout].filter(Boolean).join("\n"),
      )}`,
    );
  }
}

async function provisionFreshTarget(databaseName: string): Promise<void> {
  await createScratchDatabase(databaseName);
  migrateScratchDatabase(databaseName);
}

/** Runs `fn` with the tenant store bound to the scratch restore target (RESTORE_DB stand-in). */
async function onRestoreTarget<T>(databaseName: string, fn: () => Promise<T>): Promise<T> {
  const runtimeUrl = withDatabaseName(requireDatabaseUrl("DATABASE_URL_RUNTIME"), databaseName);
  const { result, closing } = await runWithRuntimeConnection(runtimeUrl, fn);
  await closing;
  return result;
}

async function countRowsInScope(
  scope: { kind: "service" } | { kind: "organization"; organizationId: string },
  tableName: string,
): Promise<number> {
  const tenantScope =
    scope.kind === "service"
      ? ({ kind: "service" } as const)
      : ({
          kind: "organization",
          organizationId: organizationId.brand(scope.organizationId),
        } as const);
  return await withTenantScope(tenantScope, async ({ sql }) => {
    const rows = (await sql.unsafe(`SELECT COUNT(*)::int AS count FROM "${tableName}"`)) as {
      count: number;
    }[];
    return rows[0]?.count ?? 0;
  });
}

async function secretVersionCiphertexts(orgId: string): Promise<Map<string, string>> {
  return await withTenantScope(
    { kind: "organization", organizationId: organizationId.brand(orgId) },
    async ({ sql }) => {
      const rows = (await sql`
        SELECT id, ciphertext_storage_ref FROM secret_versions ORDER BY id
      `) as { id: string; ciphertext_storage_ref: string }[];
      return new Map(rows.map((row) => [row.id, row.ciphertext_storage_ref]));
    },
  );
}

async function restoreImportOperationStates(): Promise<string[]> {
  return await withTenantScope(
    { kind: "organization", organizationId: organizationId.brand(RECOVERY_CANARY_ORGANIZATION_ID) },
    async ({ sql }) => {
      const rows = (await sql`
        SELECT state FROM operations WHERE intent_code = ${"backup.restore_import"} ORDER BY created_at
      `) as { state: string }[];
      return rows.map((row) => row.state);
    },
  );
}

async function restoreImportAuditCount(eventCode: string): Promise<number> {
  return await withTenantScope(
    { kind: "organization", organizationId: organizationId.brand(RECOVERY_CANARY_ORGANIZATION_ID) },
    async ({ sql }) => {
      const rows = (await sql`
        SELECT COUNT(*)::int AS count FROM audit_events WHERE event_code = ${eventCode}
      `) as { count: number }[];
      return rows[0]?.count ?? 0;
    },
  );
}

async function readJournalRow(): Promise<Record<string, unknown> | undefined> {
  return await withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = (await sql`SELECT * FROM restore_import_journal`) as Record<string, unknown>[];
    return rows[0];
  });
}

describeIntegration("restore import pipeline (fresh target, forced RLS)", () => {
  const rootKeyBytes = durableRootKey();
  const storage = new MemoryBackupExportStorage();
  const runSuffix = randomBytes(6).toString("hex");
  const scratchDatabases: string[] = [];
  let exportEvidence: BackupExportSuccessEvidence;
  let sourceCounts: {
    organizations: number;
    orgASecrets: number;
    orgBSecrets: number;
    orgAVersions: Map<string, string>;
    userAdmissions: number;
  };

  function scratchName(label: string): string {
    const databaseName = `insecur_restore_${label}_${runSuffix}`;
    scratchDatabases.push(databaseName);
    return databaseName;
  }

  function importInput(overrides: Record<string, unknown> = {}) {
    return {
      artifactRef: exportEvidence.artifact_ref,
      expectedInstanceId: TEST_INSTANCE_ID,
      expectedRootKeyVersion: 1,
      boundRootKeyVersions: [1],
      rootKeyBytes,
      storage,
      ...overrides,
    };
  }

  /**
   * Re-seals the authentic export payload after `mutate` rewrites its parsed rows, under a fresh
   * export identity, and registers matching export-success evidence. The envelope is genuinely
   * authentic (sealed with the real root key), so it passes the AEAD open and header/manifest
   * checks — the tamper lives in the row contents. Returns the new `artifactRef`.
   */
  async function sealTamperedArtifact(
    mutate: (rows: BackupExportRow[]) => BackupExportRow[],
  ): Promise<string> {
    const originalSealed = storage.objects.get(exportEvidence.artifact_ref);
    if (!(originalSealed instanceof Uint8Array)) {
      throw new Error("original sealed artifact missing from fixture storage");
    }
    const opened = await openBackupArtifact({
      instanceId: TEST_INSTANCE_ID,
      rootKeyBytes,
      sealedBytes: originalSealed,
    });
    const mutatedRows = mutate(parseBackupJsonlPayload(opened.jsonlPayload));
    const jsonlPayload = concatJsonlLines(mutatedRows.map((row) => encodeBackupJsonlLine(row)));

    const tamperedSealed = await sealBackupArtifact({
      instanceId: opened.header.instance_id,
      exportTimestamp: opened.header.export_timestamp,
      instanceSnapshotAt: opened.header.instance_snapshot_at,
      rootKeyBytes,
      rootKeyVersion: opened.header.root_key_version,
      jsonlPayload,
      organizationSnapshots: opened.header.organization_snapshots,
    });

    const exportIdentity = `${parseBackupExportArtifactKey(exportEvidence.artifact_ref) ?? "backup.export"}.tampered.${randomBytes(4).toString("hex")}`;
    const artifactRef = buildBackupExportArtifactKey(exportIdentity);
    storage.objects.set(artifactRef, tamperedSealed);
    storage.objects.set(
      buildBackupExportEvidenceKey(exportIdentity),
      JSON.stringify({
        ...exportEvidence,
        artifact_ref: artifactRef,
        artifact_sha256: await hashBackupArtifact(tamperedSealed),
      }),
    );
    return artifactRef;
  }

  beforeAll(async () => {
    await seedTenantBaseline();
    const exported = await runBackupExport({
      // Unique per run so replays of this suite on a shared DB never collide on the export
      // Operation idempotency key.
      scheduledAt: new Date(Date.now() - Math.floor(Math.random() * 1_000_000)),
      rootKeyBytes,
      storage,
      instanceId: TEST_INSTANCE_ID,
    });
    if (exported.exportEvidence === undefined) {
      throw new Error("backup export fixture must produce evidence");
    }
    exportEvidence = exported.exportEvidence;

    // Expectations derive from the sealed artifact itself, not a later live-DB read: other suites
    // sharing this Postgres may mutate the baseline tenants between export and assertion.
    const sealed = storage.objects.get(exportEvidence.artifact_ref);
    if (!(sealed instanceof Uint8Array)) {
      throw new Error("exported artifact bytes missing from fixture storage");
    }
    const opened = await openBackupArtifact({
      instanceId: TEST_INSTANCE_ID,
      rootKeyBytes,
      sealedBytes: sealed,
    });
    const artifactRows = parseBackupJsonlPayload(opened.jsonlPayload);
    const secretsFor = (orgId: string) =>
      artifactRows.filter((row) => row.table === "secrets" && row.organization_id === orgId).length;
    sourceCounts = {
      organizations: artifactRows.filter((row) => row.table === "organizations").length,
      orgASecrets: secretsFor(TEST_ORG_A_ID),
      orgBSecrets: secretsFor(TEST_ORG_B_ID),
      orgAVersions: new Map(
        artifactRows
          .filter(
            (row): row is BackupExportRow & { id: string; ciphertext_storage_ref: string } =>
              row.table === "secret_versions" &&
              row.organization_id === TEST_ORG_A_ID &&
              typeof row.id === "string" &&
              typeof row.ciphertext_storage_ref === "string",
          )
          .map((row) => [row.id, row.ciphertext_storage_ref]),
      ),
      userAdmissions: artifactRows.filter((row) => row.table === "user_admissions").length,
    };
  }, 120_000);

  afterAll(async () => {
    await closeRuntimeSql();
    for (const databaseName of scratchDatabases) {
      await dropScratchDatabase(databaseName);
    }
  });

  it("restores every organization into a fresh target with rows, evidence, and journal intact", async () => {
    const target = scratchName("full");
    await provisionFreshTarget(target);

    const result = await onRestoreTarget(target, () => runRestoreImport(importInput()));

    expect(result.status).toBe("succeeded");
    expect(result.organization_count).toBe(sourceCounts.organizations);
    // Every manifest org has rows here, so nothing is pruned: manifest == imported, skipped == 0.
    expect(result.manifest_organization_count).toBe(sourceCounts.organizations);
    expect(result.skipped_organization_count).toBe(0);
    expect(result.skipped_organization_ids).toEqual([]);
    expect(result.source_export_operation_id).toBe(exportEvidence.operation_id);
    expect(result.source_export_timestamp).toBe(exportEvidence.export_timestamp);
    expect(result.imported_row_count).toBeGreaterThan(0);

    await onRestoreTarget(target, async () => {
      expect(await countRowsInScope({ kind: "service" }, "organizations")).toBe(
        sourceCounts.organizations,
      );
      expect(await countRowsInScope({ kind: "service" }, "user_admissions")).toBe(
        sourceCounts.userAdmissions,
      );

      // Forced-RLS tenant scoping in the restore target proves no cross-tenant row reassignment:
      // each organization scope sees exactly its own imported rows.
      expect(
        await countRowsInScope({ kind: "organization", organizationId: TEST_ORG_A_ID }, "secrets"),
      ).toBe(sourceCounts.orgASecrets);
      expect(
        await countRowsInScope({ kind: "organization", organizationId: TEST_ORG_B_ID }, "secrets"),
      ).toBe(sourceCounts.orgBSecrets);

      // Ciphertext is copied exactly as stored — never decrypted or rewritten during import.
      expect(await secretVersionCiphertexts(TEST_ORG_A_ID)).toEqual(sourceCounts.orgAVersions);

      expect(await restoreImportOperationStates()).toEqual(["succeeded"]);
      expect(await restoreImportAuditCount("backup.restore_import_succeeded")).toBe(1);

      const journal = await readJournalRow();
      expect(journal).toMatchObject({
        status: "succeeded",
        instance_id: TEST_INSTANCE_ID,
        artifact_ref: exportEvidence.artifact_ref,
        source_export_operation_id: exportEvidence.operation_id,
        organization_count: sourceCounts.organizations,
        manifest_organization_count: sourceCounts.organizations,
        skipped_organization_count: 0,
      });
    });
  }, 120_000);

  it("refuses to import twice into the same target (replay is fresh-target-safe by construction)", async () => {
    const target = scratchName("replay");
    await provisionFreshTarget(target);
    await onRestoreTarget(target, () => runRestoreImport(importInput()));

    await expect(
      onRestoreTarget(target, () => runRestoreImport(importInput())),
    ).rejects.toMatchObject({ code: BACKUP_RESTORE_ERROR_CODES.targetNotFresh });

    await onRestoreTarget(target, async () => {
      expect(await countRowsInScope({ kind: "service" }, "organizations")).toBe(
        sourceCounts.organizations,
      );
    });
  }, 120_000);

  it("refuses the live seeded database as a restore target", async () => {
    await expect(runRestoreImport(importInput())).rejects.toMatchObject({
      code: BACKUP_RESTORE_ERROR_CODES.targetNotFresh,
    });
    expect(await readJournalRow()).toBeUndefined();
  });

  it("admits at most one of two concurrent imports into one fresh target", async () => {
    const target = scratchName("race");
    await provisionFreshTarget(target);

    const outcomes = await Promise.allSettled([
      onRestoreTarget(target, () => runRestoreImport(importInput())),
      onRestoreTarget(target, () => runRestoreImport(importInput())),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    expect([
      BACKUP_RESTORE_ERROR_CODES.importConflict,
      BACKUP_RESTORE_ERROR_CODES.targetNotFresh,
    ]).toContain(failure.code);

    await onRestoreTarget(target, async () => {
      expect(await countRowsInScope({ kind: "service" }, "restore_import_journal")).toBe(1);
      expect(await countRowsInScope({ kind: "service" }, "organizations")).toBe(
        sourceCounts.organizations,
      );
    });
  }, 120_000);

  it("keeps organizations atomic on a mid-import failure and records no success evidence", async () => {
    const target = scratchName("torn");
    await provisionFreshTarget(target);

    await expect(
      onRestoreTarget(target, () =>
        runRestoreImport(
          importInput({
            onOrganizationImported: (importedOrganizationId: string) => {
              if (importedOrganizationId === TEST_ORG_B_ID) {
                throw new Error("injected mid-import failure");
              }
            },
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: BACKUP_RESTORE_ERROR_CODES.importFailed });

    await onRestoreTarget(target, async () => {
      // Organization A committed before the injected failure; organization B is fully absent —
      // never torn — and no success evidence exists anywhere in the target.
      expect(
        await countRowsInScope({ kind: "organization", organizationId: TEST_ORG_A_ID }, "secrets"),
      ).toBe(sourceCounts.orgASecrets);
      expect(
        await countRowsInScope(
          { kind: "organization", organizationId: TEST_ORG_B_ID },
          "organizations",
        ),
      ).toBe(0);
      expect(
        await countRowsInScope({ kind: "organization", organizationId: TEST_ORG_B_ID }, "secrets"),
      ).toBe(0);
      expect(await restoreImportOperationStates()).toEqual([]);
      expect(await restoreImportAuditCount("backup.restore_import_succeeded")).toBe(0);
      expect(await readJournalRow()).toMatchObject({ status: "failed" });
    });
  }, 120_000);

  it("refuses a target missing the migrated schema", async () => {
    const target = scratchName("unmigrated");
    await createScratchDatabase(target);
    // No migrate step: the fresh-target proof must fail closed before any write.
    await expect(
      onRestoreTarget(target, () => runRestoreImport(importInput())),
    ).rejects.toMatchObject({ code: BACKUP_RESTORE_ERROR_CODES.schemaMismatch });
  }, 120_000);

  it("lets forced RLS reject a row whose own org_id crosses its import scope", async () => {
    // Tamper (authentic envelope, malformed contents): rewrite one org A `secrets` row's own
    // `org_id` column to org B. The importer groups by `organization_id`, so the row still imports
    // inside org A's `app.current_org = A` transaction — where the RLS WITH CHECK
    // (app.tenant_visible(org_id)) on the org-B org_id must REJECT the insert. This locks the last
    // line of cross-tenant defense: a future refactor dropping org_id from insertRestoreRows'
    // column set, or a table losing its WITH CHECK, fails HERE instead of silently reassigning a
    // tenant's row on restore.
    const crossTenantArtifactRef = await sealTamperedArtifact(crossTenantTamper);

    const target = scratchName("cross-tenant");
    await provisionFreshTarget(target);

    await expect(
      onRestoreTarget(target, () =>
        runRestoreImport(importInput({ artifactRef: crossTenantArtifactRef })),
      ),
    ).rejects.toMatchObject({ code: BACKUP_RESTORE_ERROR_CODES.importFailed });

    await onRestoreTarget(target, async () => {
      // The org A transaction that carried the rejected row is fully rolled back: org A is absent,
      // no success evidence exists, and the journal is terminal-failed.
      expect(
        await countRowsInScope({ kind: "organization", organizationId: TEST_ORG_A_ID }, "secrets"),
      ).toBe(0);
      expect(
        await countRowsInScope(
          { kind: "organization", organizationId: TEST_ORG_A_ID },
          "organizations",
        ),
      ).toBe(0);
      // The org-B org_id was never persisted into any scope either.
      expect(
        await countRowsInScope({ kind: "organization", organizationId: TEST_ORG_B_ID }, "secrets"),
      ).toBe(0);
      expect(await restoreImportOperationStates()).toEqual([]);
      expect(await restoreImportAuditCount("backup.restore_import_succeeded")).toBe(0);
      expect(await readJournalRow()).toMatchObject({ status: "failed" });
    });
  }, 120_000);
});
