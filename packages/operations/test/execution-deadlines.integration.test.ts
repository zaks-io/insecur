import { organizationId, projectId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_ORG_A_ID, TEST_PROJECT_A_ID } from "../../tenant-store/test/rls/test-ids.js";
import {
  claimSyncTargetLease,
  createOperation,
  getOperation,
  retryOperation,
  transitionOperation,
} from "../src/index.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const RUN = crypto.randomUUID().slice(0, 8);

describeIntegration("non-lease execution deadlines (ADR-0073)", () => {
  const org = organizationId.brand(TEST_ORG_A_ID);

  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("persists execution_deadline when transitioning to running without a lease", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "provider.reauth",
    });

    const running = await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });

    expect(running.operation.state).toBe("running");
    expect(running.operation.executionDeadline).toBeDefined();
    expect(Date.parse(running.operation.executionDeadline ?? "")).toBeGreaterThan(Date.now());
  });

  it("keeps a non-expired running operation in running on read", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "provider.reauth",
    });
    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });

    const polled = await getOperation({
      organizationId: org,
      operationId: created.operation.operationId,
    });
    expect(polled.state).toBe("running");
    expect(polled.executionDeadline).toBeDefined();
  });

  it("parks an expired non-lease running operation to incomplete with abandoned metadata", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "provider.reauth",
    });
    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE operations
        SET execution_deadline = now() - interval '1 second'
        WHERE id = ${created.operation.operationId}
      `;
    });

    const polled = await getOperation({
      organizationId: org,
      operationId: created.operation.operationId,
    });
    expect(polled.state).toBe("incomplete");
    expect(polled.progress.cause).toBe("retryable");
    expect(polled.progress.abandoned).toBe(true);
    expect(polled.executionDeadline).toBeUndefined();
  });

  it("resumes a parked abandoned operation through the existing retry contract", async () => {
    const created = await createOperation({
      organizationId: org,
      intentCode: "provider.reauth",
    });
    await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE operations
        SET execution_deadline = now() - interval '1 second'
        WHERE id = ${created.operation.operationId}
      `;
    });

    const parked = await getOperation({
      organizationId: org,
      operationId: created.operation.operationId,
    });
    expect(parked.state).toBe("incomplete");

    const resumed = await retryOperation({
      organizationId: org,
      operationId: created.operation.operationId,
    });
    expect(resumed.operation.state).toBe("running");
    expect(resumed.operation.executionDeadline).toBeDefined();
    expect(resumed.operation.progress.abandoned).toBe(true);
  });

  it("does not set execution_deadline for lease-held running operations", async () => {
    const target = {
      organizationId: org,
      projectId: projectId.brand(TEST_PROJECT_A_ID),
      providerKind: "github-actions" as const,
      targetIdentity: `lease-deadline-${RUN}`,
    };
    const created = await createOperation({
      organizationId: org,
      intentCode: "sync.run",
    });
    const lease = await claimSyncTargetLease({
      target,
      operationId: created.operation.operationId,
      ttlSeconds: 120,
    });

    const running = await transitionOperation({
      organizationId: org,
      operationId: created.operation.operationId,
      nextState: "running",
      lease,
    });

    expect(running.operation.state).toBe("running");
    expect(running.operation.executionDeadline).toBeUndefined();
    expect(running.operation.progress.syncTargetLease).toBeDefined();
  });
});
