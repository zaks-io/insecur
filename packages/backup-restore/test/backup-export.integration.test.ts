import { organizationId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { requireDatabaseUrl } from "../../tenant-store/scripts/lib/env-local.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BACKUP_EXPORT_FRESHNESS_HOURS,
  BACKUP_LATEST_EXPORT_ARTIFACT_KEY,
  MemoryBackupExportStorage,
  RECOVERY_CANARY_ORGANIZATION_ID,
  evaluateExportFreshnessEvidence,
  openBackupArtifact,
  parseBackupJsonlPayload,
  runBackupExport,
} from "../src/index.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

function durableRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = (index * 5 + 17) % 256;
  }
  return root;
}

async function ensureRecoveryCanaryOrganization(): Promise<void> {
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`
      INSERT INTO organizations (id, instance_id, display_name)
      VALUES (${RECOVERY_CANARY_ORGANIZATION_ID}, ${TEST_INSTANCE_ID}, ${"Recovery Canary"})
      ON CONFLICT (id) DO NOTHING
    `;
  });
}

async function assertRuntimeDatabaseRole(): Promise<void> {
  const runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
  const migrationUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION");
  expect(runtimeUrl).not.toEqual(migrationUrl);

  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = (await sql`
      SELECT current_user AS role_name, rolbypassrls AS bypasses_rls
      FROM pg_roles
      WHERE rolname = current_user
    `) as { role_name: string; bypasses_rls: boolean }[];
    expect(rows[0]?.bypasses_rls).toBe(false);
    expect(String(rows[0]?.role_name)).toContain("runtime");
  });
}

function rowsForOrganization(
  rows: ReturnType<typeof parseBackupJsonlPayload>,
  organizationIdValue: string,
) {
  return rows.filter(
    (row) => row.organization_id === organizationIdValue || row.org_id === organizationIdValue,
  );
}

describeIntegration("backup export pipeline (runtime role, multi-org)", () => {
  const rootKeyBytes = durableRootKey();
  const storage = new MemoryBackupExportStorage();
  const recoveryOrg = organizationId.brand(RECOVERY_CANARY_ORGANIZATION_ID);

  beforeAll(async () => {
    await seedTenantBaseline();
    await ensureRecoveryCanaryOrganization();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("uses the NOBYPASSRLS runtime credential", async () => {
    await assertRuntimeDatabaseRole();
  });

  it("seals a multi-org artifact and reports export freshness", async () => {
    const scheduledAt = new Date("2026-07-08T03:00:00.000Z");
    const first = await runBackupExport({
      scheduledAt,
      rootKeyBytes,
      storage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });

    expect(first.created).toBe(true);
    expect(first.exportEvidence?.encryption_verified).toBe(true);

    const artifact = storage.objects.get(BACKUP_LATEST_EXPORT_ARTIFACT_KEY);
    expect(artifact).toBeInstanceOf(Uint8Array);

    const opened = await openBackupArtifact({
      instanceId: TEST_INSTANCE_ID,
      rootKeyBytes,
      sealedBytes: artifact as Uint8Array,
    });
    const rows = parseBackupJsonlPayload(opened.jsonlPayload);
    expect(rowsForOrganization(rows, TEST_ORG_A_ID).length).toBeGreaterThan(0);
    expect(rowsForOrganization(rows, TEST_ORG_B_ID).length).toBeGreaterThan(0);

    const serializedArtifact = new TextDecoder().decode(artifact as Uint8Array);
    expect(serializedArtifact).not.toMatch(/INSECUR_RECOVERY_CANARY/);
    expect(serializedArtifact).not.toMatch(/"plaintext"/i);

    const rootKeyHex = Buffer.from(rootKeyBytes).toString("hex");
    expect(serializedArtifact).not.toContain(rootKeyHex);

    const fresh = evaluateExportFreshnessEvidence(first.exportEvidence ?? null, scheduledAt);
    expect(fresh.status).toBe("passed");

    const staleAt = new Date(
      scheduledAt.getTime() + BACKUP_EXPORT_FRESHNESS_HOURS * 60 * 60 * 1000 + 1_000,
    );
    const stale = evaluateExportFreshnessEvidence(first.exportEvidence ?? null, staleAt);
    expect(stale.status).toBe("blocked");
  });

  it("starts a new Operation per scheduled run and replays duplicate cron idempotently", async () => {
    const firstRun = await runBackupExport({
      scheduledAt: new Date("2026-07-09T03:00:00.000Z"),
      rootKeyBytes,
      storage: new MemoryBackupExportStorage(),
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const replay = await runBackupExport({
      scheduledAt: new Date("2026-07-09T03:00:00.000Z"),
      rootKeyBytes,
      storage: new MemoryBackupExportStorage(),
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const secondRun = await runBackupExport({
      scheduledAt: new Date("2026-07-10T03:00:00.000Z"),
      rootKeyBytes,
      storage: new MemoryBackupExportStorage(),
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });

    expect(firstRun.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.operation.operationId).toEqual(firstRun.operation.operationId);
    expect(secondRun.created).toBe(true);
    expect(secondRun.operation.operationId).not.toEqual(firstRun.operation.operationId);
  });
});
