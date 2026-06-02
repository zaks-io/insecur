import { auditEventId, organizationId, projectId } from "@insecur/domain";
import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_ORG_A_ID, TEST_PROJECT_A_ID } from "../../tenant-store/test/rls/test-ids.js";
import {
  assertSyncTargetLease,
  claimSyncTargetLease,
  createOperation,
  getOperation,
  OperationStoreError,
  recordOperationProgress,
  releaseSyncTargetLease,
  renewSyncTargetLease,
  retryOperation,
  transitionOperation,
  cancelOperation,
} from "../src/index.js";
import type { OperationProgressInput } from "../src/operation-types.js";
import type { SyncTargetKey } from "../src/sync-target-types.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

function testTarget(suffix: string): SyncTargetKey {
  return {
    organizationId: organizationId.brand(TEST_ORG_A_ID),
    projectId: projectId.brand(TEST_PROJECT_A_ID),
    providerKind: "github-actions",
    targetIdentity: `acme/widget-${suffix}`,
  };
}

describeIntegration("sync target leases", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("translates concurrent claim races into retryable sync.target_busy", async () => {
    const target = testTarget("concurrent-race");
    const [firstOp, secondOp] = await Promise.all([
      createOperation({ organizationId: target.organizationId, intentCode: "sync.run" }),
      createOperation({ organizationId: target.organizationId, intentCode: "sync.run" }),
    ]);
    const contenders = [
      { operationId: firstOp.operation.operationId },
      { operationId: secondOp.operation.operationId },
    ];

    const results = await Promise.allSettled(
      contenders.map((contender) =>
        claimSyncTargetLease({
          target,
          operationId: contender.operationId,
          ttlSeconds: 120,
        }),
      ),
    );

    const outcomes = results.flatMap((result, index) => {
      const contender = contenders[index];
      if (contender === undefined) {
        return [];
      }
      return [{ contender, result }];
    });

    const winners = outcomes.filter(
      (outcome): outcome is typeof outcome & { result: PromiseFulfilledResult<unknown> } =>
        outcome.result.status === "fulfilled",
    );
    const losers = outcomes.filter((outcome) => outcome.result.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    expect(loser).toBeDefined();
    if (loser?.result.status === "rejected") {
      expect(loser.result.reason).toMatchObject({
        code: "sync.target_busy",
        retryable: true,
      });
    }

    const winner = winners[0];
    expect(winner).toBeDefined();
    if (winner === undefined || winner.result.status !== "fulfilled") {
      throw new Error("expected one successful concurrent lease claim");
    }

    await releaseSyncTargetLease({
      target,
      operationId: winner.contender.operationId,
      fencingToken: winner.result.value.fencingToken,
    });
  });

  it("allows only one active writer per exact sync target", async () => {
    const target = testTarget("concurrent");
    const firstOp = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const secondOp = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });

    const firstLease = await claimSyncTargetLease({
      target,
      operationId: firstOp.operation.operationId,
      ttlSeconds: 120,
    });
    expect(firstLease.fencingToken).toBe(1);

    await expect(
      claimSyncTargetLease({
        target,
        operationId: secondOp.operation.operationId,
        ttlSeconds: 120,
      }),
    ).rejects.toMatchObject({
      code: "sync.target_busy",
      retryable: true,
    });

    await releaseSyncTargetLease({
      target,
      operationId: firstOp.operation.operationId,
      fencingToken: firstLease.fencingToken,
    });

    const secondLease = await claimSyncTargetLease({
      target,
      operationId: secondOp.operation.operationId,
      ttlSeconds: 120,
    });
    expect(secondLease.fencingToken).toBe(1);
  });

  it("rejects caller-injected syncTargetLease on progress mutations", async () => {
    const target = testTarget("reject-injected-lease");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const lease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 120,
    });

    const injectedProgress = {
      syncTargetLease: {
        projectId: target.projectId,
        providerKind: target.providerKind,
        targetIdentity: target.targetIdentity,
        fencingToken: lease.fencingToken + 99,
      },
    } as OperationProgressInput;

    await expect(
      transitionOperation({
        organizationId: target.organizationId,
        operationId: created.operation.operationId,
        expectedState: "pending",
        nextState: "running",
        progress: injectedProgress,
      }),
    ).rejects.toMatchObject({
      code: "operation.invalid_metadata",
    });

    await expect(
      recordOperationProgress({
        organizationId: target.organizationId,
        operationId: created.operation.operationId,
        progress: injectedProgress,
      }),
    ).rejects.toMatchObject({
      code: "operation.invalid_metadata",
    });

    const polled = await getOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
    });
    expect(polled.progress.syncTargetLease?.fencingToken).toBe(lease.fencingToken);
  });

  it("requires a fencing token for guarded transitions after lease claim", async () => {
    const target = testTarget("lease-required");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 120,
    });

    await expect(
      transitionOperation({
        organizationId: target.organizationId,
        operationId: created.operation.operationId,
        expectedState: "pending",
        nextState: "running",
      }),
    ).rejects.toMatchObject({
      code: "operation.lease_required",
    });
  });

  it("rejects guarded transitions when the fencing token is stale", async () => {
    const target = testTarget("stale-fencing");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const lease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 1,
    });

    await transitionOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      expectedState: "pending",
      nextState: "running",
      lease,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 1_100);
    });

    const superseded = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const takeover = await claimSyncTargetLease({
      target,
      operationId: superseded.operation.operationId,
      ttlSeconds: 60,
    });
    expect(takeover.fencingToken).toBeGreaterThan(lease.fencingToken);

    await expect(
      transitionOperation({
        organizationId: target.organizationId,
        operationId: created.operation.operationId,
        expectedState: "running",
        nextState: "succeeded",
      }),
    ).rejects.toMatchObject({
      code: "operation.lease_required",
    });

    const auditRef = auditEventId.brand("aud_00000000000000000000000003");
    await expect(
      transitionOperation({
        organizationId: target.organizationId,
        operationId: created.operation.operationId,
        expectedState: "running",
        nextState: "succeeded",
        lease,
        progress: {
          auditEventIds: [auditRef],
          resultCode: "sync.target_busy",
        },
      }),
    ).rejects.toMatchObject({
      code: "operation.stale_fencing_token",
    });
  });

  it("supersedes stale leases and resumes with a new fencing token", async () => {
    const target = testTarget("stale-takeover");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const firstLease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 1,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 1_100);
    });

    const resumedLease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 120,
    });
    expect(resumedLease.fencingToken).toBeGreaterThan(firstLease.fencingToken);

    await assertSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      fencingToken: resumedLease.fencingToken,
    });
  });

  it("renews an active lease and releases on terminal cancel", async () => {
    const target = testTarget("renew-release");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const claimed = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 30,
    });

    const renewed = await renewSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      fencingToken: claimed.fencingToken,
      ttlSeconds: 90,
    });
    expect(renewed.fencingToken).toBe(claimed.fencingToken);

    await transitionOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      expectedState: "pending",
      nextState: "running",
      lease: renewed,
    });

    const canceled = await cancelOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
    });
    expect(canceled.operation.state).toBe("canceled");

    await releaseSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      fencingToken: renewed.fencingToken,
    });

    const polled = await getOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
    });
    expect(polled.progress).not.toHaveProperty("syncTargetLease");

    await expect(
      assertSyncTargetLease({
        target,
        operationId: created.operation.operationId,
        fencingToken: renewed.fencingToken,
      }),
    ).rejects.toMatchObject({
      code: "operation.lease_not_held",
    });
  });

  it("releases lease binding after terminal success", async () => {
    const target = testTarget("release-after-success");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const lease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 60,
    });

    await transitionOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      expectedState: "pending",
      nextState: "running",
      lease,
    });
    await transitionOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      expectedState: "running",
      nextState: "succeeded",
      lease,
    });

    await releaseSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      fencingToken: lease.fencingToken,
    });

    const polled = await getOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
    });
    expect(polled.state).toBe("succeeded");
    expect(polled.progress).not.toHaveProperty("syncTargetLease");
  });

  it("supports retry resume with lease reclaim and guarded progress", async () => {
    const target = testTarget("retry-resume");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const lease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 120,
    });

    await transitionOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      expectedState: "pending",
      nextState: "running",
      lease,
    });
    await transitionOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      expectedState: "running",
      nextState: "incomplete",
      lease,
    });
    await releaseSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      fencingToken: lease.fencingToken,
    });

    const resumed = await retryOperation({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
    });
    expect(resumed.operation.state).toBe("running");

    const reclaimed = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 120,
    });
    expect(reclaimed.fencingToken).toBeGreaterThanOrEqual(1);

    const progress = await recordOperationProgress({
      organizationId: target.organizationId,
      operationId: created.operation.operationId,
      lease: reclaimed,
      progress: {
        counters: { bindingsWritten: 1 },
      },
    });
    expect(progress.operation.progress.counters?.bindingsWritten).toBe(1);
    expect(progress.operation.progress).not.toHaveProperty("value");
  });

  it("rejects progress updates with a stale fencing token", async () => {
    const target = testTarget("stale-progress");
    const created = await createOperation({
      organizationId: target.organizationId,
      intentCode: "sync.run",
    });
    const lease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 60,
    });
    await releaseSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      fencingToken: lease.fencingToken,
    });

    await expect(
      recordOperationProgress({
        organizationId: target.organizationId,
        operationId: created.operation.operationId,
        lease,
        progress: { counters: { bindingsWritten: 0 } },
      }),
    ).rejects.toBeInstanceOf(OperationStoreError);
  });
});
