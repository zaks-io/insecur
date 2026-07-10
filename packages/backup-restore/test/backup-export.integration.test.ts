import { organizationId } from "@insecur/domain";
import { TenantOperationStore } from "@insecur/operations";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { requireDatabaseUrl } from "../../tenant-store/scripts/lib/env-local.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  BACKUP_EXPORT_FRESHNESS_HOURS,
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  buildBackupExportEvidenceKey,
  buildBackupExportIdempotencyKey,
  buildOrganizationScopeJsonlLines,
  concatJsonlLines,
  hashBackupArtifact,
  MemoryBackupExportStorage,
  RECOVERY_CANARY_ORGANIZATION_ID,
  evaluateExportFreshnessEvidence,
  openBackupArtifact,
  parseBackupJsonlPayload,
  runBackupExport,
  verifyBackupExportArtifact,
} from "../src/index.js";
import type { BackupExportStep, BackupExportSuccessEvidence } from "../src/index.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;
const SNAPSHOT_TEST_ENVIRONMENT_ID = "env_00000000000000000000000099";

function durableRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = (index * 5 + 17) % 256;
  }
  return root;
}

async function canaryOrganizationRowCount(): Promise<number> {
  return await withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM organizations
      WHERE id = ${RECOVERY_CANARY_ORGANIZATION_ID}
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
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

async function deleteSnapshotTestEnvironment(): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: organizationId.brand(TEST_ORG_A_ID) },
    async ({ sql }) => {
      await sql`DELETE FROM environments WHERE id = ${SNAPSHOT_TEST_ENVIRONMENT_ID}`;
    },
  );
}

function rowsForOrganization(
  rows: ReturnType<typeof parseBackupJsonlPayload>,
  organizationIdValue: string,
) {
  return rows.filter(
    (row) => row.organization_id === organizationIdValue || row.org_id === organizationIdValue,
  );
}

function readLatestExportEvidence(storage: MemoryBackupExportStorage): BackupExportSuccessEvidence {
  const serialized = storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
  expect(typeof serialized).toBe("string");
  return JSON.parse(serialized as string) as BackupExportSuccessEvidence;
}

function requireExportEvidence(
  exportEvidence: BackupExportSuccessEvidence | undefined,
): BackupExportSuccessEvidence {
  if (exportEvidence === undefined) {
    throw new Error("successful backup export must produce evidence");
  }
  return exportEvidence;
}

describeIntegration("backup export pipeline (runtime role, multi-org)", () => {
  const rootKeyBytes = durableRootKey();
  const storage = new MemoryBackupExportStorage();
  const recoveryOrg = organizationId.brand(RECOVERY_CANARY_ORGANIZATION_ID);

  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  async function operationStateForScheduledRun(scheduledAt: Date): Promise<string | undefined> {
    return await withTenantScope(
      { kind: "organization", organizationId: recoveryOrg },
      async ({ sql }) => {
        const operation = await new TenantOperationStore(sql).findByIdempotencyKey(
          recoveryOrg,
          buildBackupExportIdempotencyKey(scheduledAt),
        );
        return operation?.state;
      },
    );
  }

  async function failureAuditEventCountForScheduledRun(scheduledAt: Date): Promise<number> {
    return await withTenantScope(
      { kind: "organization", organizationId: recoveryOrg },
      async ({ sql }) => {
        const operation = await new TenantOperationStore(sql).findByIdempotencyKey(
          recoveryOrg,
          buildBackupExportIdempotencyKey(scheduledAt),
        );
        expect(operation).toBeDefined();
        const rows = (await sql`
          SELECT COUNT(*)::int AS count
          FROM audit_events
          WHERE operation_id = ${operation?.operationId ?? ""}
            AND event_code = ${"backup.export_failed"}
        `) as { count: number }[];
        return rows[0]?.count ?? 0;
      },
    );
  }

  async function assertFailureDoesNotAdvanceLatestPointer(input: {
    step: BackupExportStep;
    priorScheduledAt: Date;
    failedScheduledAt: Date;
  }): Promise<void> {
    const failureMessage = `test failure after ${input.step}`;
    const storage = new MemoryBackupExportStorage();
    await runBackupExport({
      scheduledAt: input.priorScheduledAt,
      rootKeyBytes,
      storage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const priorPointer = storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    expect(typeof priorPointer).toBe("string");

    await expect(
      runBackupExport({
        scheduledAt: input.failedScheduledAt,
        rootKeyBytes,
        storage,
        organizationId: recoveryOrg,
        instanceId: TEST_INSTANCE_ID,
        onStepCompleted: (step) => {
          if (step === input.step) {
            throw new Error(failureMessage);
          }
        },
      }),
    ).rejects.toThrow(failureMessage);

    expect(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe(priorPointer);
    expect(await operationStateForScheduledRun(input.failedScheduledAt)).toBe("failed");
    expect(await failureAuditEventCountForScheduledRun(input.failedScheduledAt)).toBe(1);
  }

  it("uses the NOBYPASSRLS runtime credential", async () => {
    await assertRuntimeDatabaseRole();
  });

  it("provisions the recovery-canary sentinel organization through the standard seed path", async () => {
    // No test-only per-suite canary insert: the from-scratch baseline seed is the only thing that
    // ran, and it must have created the sentinel org so the export's Operation/audit FK resolves.
    expect(await canaryOrganizationRowCount()).toBe(1);
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

    const latestEvidence = readLatestExportEvidence(storage);
    expect(latestEvidence).toEqual(first.exportEvidence);
    const artifact = storage.objects.get(latestEvidence.artifact_ref);
    expect(artifact).toBeInstanceOf(Uint8Array);

    const opened = await openBackupArtifact({
      instanceId: TEST_INSTANCE_ID,
      rootKeyBytes,
      sealedBytes: artifact as Uint8Array,
    });
    const rows = parseBackupJsonlPayload(opened.jsonlPayload);
    expect(opened.header.instance_snapshot_at).not.toBe(scheduledAt.toISOString());
    expect(Number.isNaN(Date.parse(opened.header.instance_snapshot_at))).toBe(false);
    const organizationSnapshot = opened.header.organization_snapshots.find(
      (snapshot) => snapshot.organization_id === TEST_ORG_A_ID,
    );
    expect(organizationSnapshot?.snapshot_at).not.toBe(scheduledAt.toISOString());
    expect(Number.isNaN(Date.parse(organizationSnapshot?.snapshot_at ?? ""))).toBe(false);
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

  it("does not advance the latest pointer when a run fails after artifact_stored", async () => {
    await assertFailureDoesNotAdvanceLatestPointer({
      step: "artifact_stored",
      priorScheduledAt: new Date("2026-07-12T01:00:00.000Z"),
      failedScheduledAt: new Date("2026-07-12T02:00:00.000Z"),
    });
  });

  it("does not advance the latest pointer when a run fails after evidence_stored", async () => {
    await assertFailureDoesNotAdvanceLatestPointer({
      step: "evidence_stored",
      priorScheduledAt: new Date("2026-07-12T03:00:00.000Z"),
      failedScheduledAt: new Date("2026-07-12T04:00:00.000Z"),
    });
  });

  it("does not advance the latest pointer when a run fails after audit_recorded", async () => {
    await assertFailureDoesNotAdvanceLatestPointer({
      step: "audit_recorded",
      priorScheduledAt: new Date("2026-07-12T05:00:00.000Z"),
      failedScheduledAt: new Date("2026-07-12T06:00:00.000Z"),
    });
  });

  it("keeps a run succeeded and repairs the pointer on replay when the final publish fails", async () => {
    const storage = new MemoryBackupExportStorage();
    const scheduledAt = new Date("2026-07-12T09:00:00.000Z");
    const onExportFailureAlert = vi.fn();
    const publishFailure = new Error("simulated transient latest-pointer put failure");

    await expect(
      runBackupExport({
        scheduledAt,
        rootKeyBytes,
        storage,
        organizationId: recoveryOrg,
        instanceId: TEST_INSTANCE_ID,
        onExportFailureAlert,
        onStepCompleted: (step) => {
          if (step === "operation_succeeded") {
            throw publishFailure;
          }
        },
      }),
    ).rejects.toMatchObject({
      name: "BackupExportPointerPublishError",
      cause: publishFailure,
    });

    // The failure after success must page, but never rewrite the run's outcome: the Operation
    // stays succeeded, no contradictory failure audit event exists, and the pointer is untouched.
    expect(onExportFailureAlert).toHaveBeenCalledTimes(1);
    expect(await operationStateForScheduledRun(scheduledAt)).toBe("succeeded");
    expect(await failureAuditEventCountForScheduledRun(scheduledAt)).toBe(0);
    expect(storage.objects.has(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe(false);

    // Replaying the same scheduled run re-publishes the pointer from the durable per-run evidence.
    const replay = await runBackupExport({
      scheduledAt,
      rootKeyBytes,
      storage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    expect(replay.created).toBe(false);
    const stagedEvidence = storage.objects.get(
      buildBackupExportEvidenceKey(buildBackupExportIdempotencyKey(scheduledAt)),
    );
    expect(readLatestExportEvidence(storage)).toEqual(JSON.parse(stagedEvidence as string));
  });

  it("does not cross-link immutable artifacts when scheduled runs share storage", async () => {
    const sharedStorage = new MemoryBackupExportStorage();
    const firstScheduledAt = new Date("2026-07-12T07:00:00.000Z");
    const secondScheduledAt = new Date("2026-07-12T08:00:00.000Z");
    const first = await runBackupExport({
      scheduledAt: firstScheduledAt,
      rootKeyBytes,
      storage: sharedStorage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const firstEvidence = requireExportEvidence(first.exportEvidence);
    const firstArtifact = sharedStorage.objects.get(firstEvidence.artifact_ref);
    const firstStagedEvidence = sharedStorage.objects.get(
      buildBackupExportEvidenceKey(buildBackupExportIdempotencyKey(firstScheduledAt)),
    );
    expect(firstArtifact).toBeInstanceOf(Uint8Array);
    expect(typeof firstStagedEvidence).toBe("string");
    expect(JSON.parse(firstStagedEvidence as string)).toEqual(firstEvidence);

    const second = await runBackupExport({
      scheduledAt: secondScheduledAt,
      rootKeyBytes,
      storage: sharedStorage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const secondEvidence = requireExportEvidence(second.exportEvidence);
    const latestEvidence = readLatestExportEvidence(sharedStorage);
    const latestArtifact = sharedStorage.objects.get(latestEvidence.artifact_ref);

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(firstEvidence.artifact_ref).not.toBe(secondEvidence.artifact_ref);
    expect(latestEvidence).toEqual(secondEvidence);
    expect(latestArtifact).toBeInstanceOf(Uint8Array);
    expect(await hashBackupArtifact(latestArtifact as Uint8Array)).toBe(
      latestEvidence.artifact_sha256,
    );
    expect(
      await verifyBackupExportArtifact({
        evidence: latestEvidence,
        artifactRef: latestEvidence.artifact_ref,
        sealedArtifact: latestArtifact as Uint8Array,
      }),
    ).toBe(true);
    expect(sharedStorage.objects.get(firstEvidence.artifact_ref)).toBe(firstArtifact);
    expect(
      sharedStorage.objects.get(
        buildBackupExportEvidenceKey(buildBackupExportIdempotencyKey(firstScheduledAt)),
      ),
    ).toBe(firstStagedEvidence);
  });

  it("keeps an organization export on one database snapshot across concurrent writes", async () => {
    const organization = organizationId.brand(TEST_ORG_A_ID);
    let concurrentWriteCommitted = false;

    await deleteSnapshotTestEnvironment();
    try {
      const exported = await buildOrganizationScopeJsonlLines(organization, {
        afterTableRead: async (tableName) => {
          if (tableName !== "organizations") {
            return;
          }
          await withTenantScope(
            { kind: "organization", organizationId: organization },
            async ({ sql }) => {
              await sql`
              INSERT INTO environments (
                id,
                org_id,
                project_id,
                display_name,
                is_protected,
                lifecycle_stage
              )
              VALUES (
                ${SNAPSHOT_TEST_ENVIRONMENT_ID},
                ${TEST_ORG_A_ID},
                ${TEST_PROJECT_A_ID},
                ${"Snapshot consistency test environment"},
                false,
                ${"development"}
              )
            `;
            },
          );
          concurrentWriteCommitted = true;
        },
      });

      const rows = parseBackupJsonlPayload(concatJsonlLines(exported.lines));
      expect(concurrentWriteCommitted).toBe(true);
      expect(
        rows.some((row) => row.table === "environments" && row.id === SNAPSHOT_TEST_ENVIRONMENT_ID),
      ).toBe(false);
    } finally {
      await deleteSnapshotTestEnvironment();
    }
  });

  it("starts a new Operation per scheduled run and replays duplicate cron idempotently", async () => {
    // Replay shares the storage bucket with the original run, mirroring production where every
    // scheduler invocation targets the same R2 bucket holding the durable per-run evidence.
    const sharedStorage = new MemoryBackupExportStorage();
    const firstRun = await runBackupExport({
      scheduledAt: new Date("2026-07-09T03:00:00.000Z"),
      rootKeyBytes,
      storage: sharedStorage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const replay = await runBackupExport({
      scheduledAt: new Date("2026-07-09T03:00:00.000Z"),
      rootKeyBytes,
      storage: sharedStorage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });
    const secondRun = await runBackupExport({
      scheduledAt: new Date("2026-07-10T03:00:00.000Z"),
      rootKeyBytes,
      storage: sharedStorage,
      organizationId: recoveryOrg,
      instanceId: TEST_INSTANCE_ID,
    });

    expect(firstRun.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.operation.operationId).toEqual(firstRun.operation.operationId);
    expect(secondRun.created).toBe(true);
    expect(secondRun.operation.operationId).not.toEqual(firstRun.operation.operationId);
    expect(readLatestExportEvidence(sharedStorage)).toEqual(secondRun.exportEvidence);
  });

  it("fires the failure alert and rethrows when createOperation fails", async () => {
    // Scoping the export to an organization that was never seeded makes createOperation FK-violate
    // (operations.org_id -> organizations.id) before any Operation row exists. That failure must
    // still page the operator: a backup pipeline that dies silently is worse than none.
    const unseededOrg = organizationId.brand("org_000000000000000000000BADFK");
    const onExportFailureAlert = vi.fn();

    await expect(
      runBackupExport({
        scheduledAt: new Date("2026-07-11T03:00:00.000Z"),
        rootKeyBytes,
        storage: new MemoryBackupExportStorage(),
        organizationId: unseededOrg,
        instanceId: TEST_INSTANCE_ID,
        onExportFailureAlert,
      }),
    ).rejects.toThrow();

    expect(onExportFailureAlert).toHaveBeenCalledTimes(1);
  });
});
