import { auditEventId, organizationId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { casApplyOperationTransition } from "../src/apply-operation-transition.js";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import { TenantOperationStore } from "../src/tenant-operation-store.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_ORG_A_ID, TEST_ORG_B_ID } from "../../tenant-store/test/rls/test-ids.js";
import {
  cancelOperation,
  createOperation,
  getOperation,
  OperationStoreError,
  recordOperationProgress,
  retryOperation,
  transitionOperation,
} from "../src/index.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("operation store (tenant-scoped)", () => {
  const org = organizationId.brand(TEST_ORG_A_ID);

  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("returns the same operation for retried create idempotency keys", async () => {
    const first = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
      idempotencyKey: "idem-create-sync-run-1",
    });
    expect(first.created).toBe(true);

    const second = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
      idempotencyKey: "idem-create-sync-run-1",
    });
    expect(second.created).toBe(false);
    expect(second.operation.operationId).toEqual(first.operation.operationId);
  });

  it("returns the existing operation when progress differs but idempotency key and intent match", async () => {
    const first = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
      idempotencyKey: "idem-create-sync-run-progress",
      progress: { counters: { step: 1 } },
    });
    expect(first.created).toBe(true);

    const second = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
      idempotencyKey: "idem-create-sync-run-progress",
      progress: { counters: { step: 99 } },
    });
    expect(second.created).toBe(false);
    expect(second.operation.operationId).toEqual(first.operation.operationId);
    expect(second.operation.progress).toEqual(first.operation.progress);
  });

  it("isolates idempotency keys across organizations with the same key value", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const sharedKey = "idem-cross-org-shared-key-1";

    const orgACreate = await createOperation({
      organizationId: orgA,
      intentCode: "sync.run",
      idempotencyKey: sharedKey,
    });
    expect(orgACreate.created).toBe(true);

    const orgBCreate = await createOperation({
      organizationId: orgB,
      intentCode: "provider.reauth",
      idempotencyKey: sharedKey,
    });
    expect(orgBCreate.created).toBe(true);
    expect(orgBCreate.operation.operationId).not.toEqual(orgACreate.operation.operationId);
    expect(orgBCreate.operation.intentCode).toBe("provider.reauth");

    const orgBReplay = await createOperation({
      organizationId: orgB,
      intentCode: "provider.reauth",
      idempotencyKey: sharedKey,
    });
    expect(orgBReplay.created).toBe(false);
    expect(orgBReplay.operation.operationId).toEqual(orgBCreate.operation.operationId);
    expect(orgBReplay.operation.operationId).not.toEqual(orgACreate.operation.operationId);

    const orgAReplay = await createOperation({
      organizationId: orgA,
      intentCode: "sync.run",
      idempotencyKey: sharedKey,
    });
    expect(orgAReplay.created).toBe(false);
    expect(orgAReplay.operation.operationId).toEqual(orgACreate.operation.operationId);

    await expect(
      getOperation({
        organizationId: orgB,
        operationId: orgACreate.operation.operationId,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.notFound,
    });

    await withTenantScope({ kind: "organization", organizationId: orgB }, async ({ sql }) => {
      const store = new TenantOperationStore(sql);
      const byKey = await store.findByIdempotencyKey(orgB, sharedKey);
      expect(byKey?.operationId).toEqual(orgBCreate.operation.operationId);
      expect(byKey?.operationId).not.toEqual(orgACreate.operation.operationId);
    });
  });

  it("rejects idempotency key reuse with a different intent code", async () => {
    const first = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
      idempotencyKey: "idem-intent-mismatch-1",
    });

    await expect(
      createOperation({
        organizationId: org,
        intentCode: "provider.reauth",
        idempotencyKey: "idem-intent-mismatch-1",
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.idempotencyMismatch,
    });

    const replay = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
      idempotencyKey: "idem-intent-mismatch-1",
    });
    expect(replay.created).toBe(false);
    expect(replay.operation.operationId).toEqual(first.operation.operationId);
    expect(replay.operation.intentCode).toBe("sync.run");
  });

  it("rejects stale compare-and-set transitions and terminal overwrites", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
    });

    const running = await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });
    expect(running.operation.state).toBe("running");

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      const store = new TenantOperationStore(sql);
      const snapshot = await store.getById(org, created.operation.operationId);
      if (snapshot === null) {
        throw new Error("operation not found");
      }
      expect(snapshot.state).toBe("running");

      await casApplyOperationTransition(sql, snapshot, {
        organizationId: org,
        operationId: created.operation.operationId,
        nextState: "blocked",
        progressPatch: {},
        legalFromStates: "by-transition-table",
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: (state) => `operation transition not allowed: ${state} -> blocked`,
        },
      });

      await expect(
        casApplyOperationTransition(sql, snapshot, {
          organizationId: org,
          operationId: created.operation.operationId,
          nextState: "incomplete",
          progressPatch: {},
          legalFromStates: "by-transition-table",
          notAllowedError: {
            code: OPERATION_ERROR_CODES.invalidTransition,
            message: (state) => `operation transition not allowed: ${state} -> incomplete`,
          },
        }),
      ).rejects.toMatchObject({
        code: "operation.stale_transition",
      });
    });

    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });
    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "succeeded",
    });

    await expect(
      transitionOperation({
        organizationId: org,
        operationId: created.operation.operationId,
        nextState: "running",
      }),
    ).rejects.toMatchObject({
      code: "operation.terminal_state",
    });
  });

  it("records audit references and safe polling output", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "provider.reauth",
    });

    const auditRef = auditEventId.brand("aud_00000000000000000000000002");
    const updated = await recordOperationProgress({
      organizationId: org,
      operationId: created.operation.operationId,
      progress: {
        auditEventIds: [auditRef],
        resultCode: "auth.reauth_required",
      },
    });

    expect(updated.operation.progress.auditEventIds).toEqual([auditRef]);
    expect(updated.operation.progress).not.toHaveProperty("value");
    expect(updated.operation.progress).not.toHaveProperty("plaintext");

    const polled = await getOperation({
      organizationId: org,
      operationId: created.operation.operationId,
    });
    expect(polled.progress.auditEventIds).toEqual([auditRef]);
  });

  it("resumes incomplete operations and honors retry idempotency keys", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
    });

    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });
    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "incomplete",
    });

    const resumed = await retryOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      idempotencyKey: "idem-retry-1",
    });
    expect(resumed.operation.state).toBe("running");

    const replay = await retryOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      idempotencyKey: "idem-retry-1",
    });
    expect(replay.operation.operationId).toEqual(resumed.operation.operationId);
    expect(replay.operation.state).toBe("running");
  });

  it("cancels cancelable operations", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
    });

    const canceled = await cancelOperation({
      organizationId: org,
      operationId: created.operation.operationId,
    });
    expect(canceled.operation.state).toBe("canceled");

    await expect(
      cancelOperation({
        organizationId: org,
        operationId: created.operation.operationId,
      }),
    ).rejects.toBeInstanceOf(OperationStoreError);
  });
});
