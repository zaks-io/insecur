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
      nextState: "running",
    });
    expect(running.operation.state).toBe("running");

    const [firstConcurrent, secondConcurrent] = await Promise.allSettled([
      transitionOperation({
        organizationId: org,
        operationId: created.operation.operationId,
        nextState: "succeeded",
      }),
      transitionOperation({
        organizationId: org,
        operationId: created.operation.operationId,
        nextState: "failed",
      }),
    ]);
    const concurrentOutcomes = [firstConcurrent, secondConcurrent];
    const concurrentFulfilled = concurrentOutcomes.filter(
      (result) => result.status === "fulfilled",
    );
    const concurrentRejected = concurrentOutcomes.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(concurrentFulfilled).toHaveLength(1);
    expect(concurrentRejected).toHaveLength(1);
    expect(concurrentRejected[0]?.reason).toMatchObject({
      code: "operation.stale_transition",
    });

    const terminalState =
      concurrentFulfilled[0]?.status === "fulfilled"
        ? concurrentFulfilled[0].value.operation.state
        : undefined;
    expect(terminalState).toMatch(/^(succeeded|failed)$/);

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
