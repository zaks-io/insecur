import { auditEventId, organizationId } from "@insecur/domain";
import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_ORG_A_ID } from "../../tenant-store/test/rls/test-ids.js";
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

  it("rejects stale compare-and-set transitions and terminal overwrites", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
    });

    const running = await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      expectedState: "pending",
      nextState: "running",
    });
    expect(running.operation.state).toBe("running");

    await expect(
      transitionOperation({
        organizationId: org,
        operationId: created.operation.operationId,
        expectedState: "pending",
        nextState: "blocked",
      }),
    ).rejects.toMatchObject({
      code: "operation.stale_transition",
    });

    const succeeded = await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      expectedState: "running",
      nextState: "succeeded",
    });
    expect(succeeded.operation.state).toBe("succeeded");

    await expect(
      transitionOperation({
        organizationId: org,
        operationId: created.operation.operationId,
        expectedState: "succeeded",
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
      expectedState: "pending",
      nextState: "running",
    });
    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      expectedState: "running",
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
