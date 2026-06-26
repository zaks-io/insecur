import { organizationId, operationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_INTENT_CODES } from "../src/operation-intent-codes.js";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import type { OperationRow } from "../src/operation-row.js";
import type { OperationPollResult } from "../src/operation-types.js";
import {
  findActiveLeaseForOperation,
  isOperationExecutionClaimExpired,
  parkAbandonedRunningOperation,
  resolveOperationLiveness,
} from "../src/resolve-operation-liveness.js";
import type { SyncTargetLeaseRow } from "../src/sync-target-lease-row.js";
import { createFakeTenantSql, queryIncludes } from "./helpers/fake-tenant-sql.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");

function sampleOperation(overrides: Partial<OperationPollResult> = {}): OperationPollResult {
  return {
    operationId: OP,
    organizationId: ORG,
    state: "running",
    intentCode: OPERATION_INTENT_CODES.syncRun,
    progress: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function operationRowFromPoll(
  operation: OperationPollResult,
  overrides: Partial<OperationRow> = {},
): OperationRow {
  return {
    id: operation.operationId,
    org_id: operation.organizationId,
    state: operation.state,
    intent_code: operation.intentCode,
    idempotency_key: null,
    progress: operation.progress,
    execution_deadline: operation.executionDeadline ?? null,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt,
    ...overrides,
  };
}

function activeLeaseRow(expiresAt: string): SyncTargetLeaseRow {
  return {
    org_id: ORG,
    project_id: PRJ,
    provider_kind: "github-actions",
    target_identity: "acme/widget",
    held_by_operation_id: OP,
    fencing_token: "2",
    expires_at: expiresAt,
  };
}

describe("resolve operation liveness", () => {
  it("treats lease-backed running operations as live while the lease is active", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const operation = sampleOperation({
      progress: {
        syncTargetLease: {
          projectId: PRJ,
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 2,
        },
      },
    });

    expect(
      isOperationExecutionClaimExpired(
        operation,
        {
          target: {
            organizationId: ORG,
            projectId: PRJ,
            providerKind: "github-actions",
            targetIdentity: "acme/widget",
          },
          heldByOperationId: OP,
          fencingToken: 2,
          expiresAt: "2026-01-01T01:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not expire lease-backed running operations when the active lease row is missing", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const operation = sampleOperation({
      progress: {
        syncTargetLease: {
          projectId: PRJ,
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 2,
        },
      },
    });

    expect(isOperationExecutionClaimExpired(operation, null, now)).toBe(false);
  });

  it("expires lease-backed running operations when the active lease is past expiry", () => {
    const now = new Date("2026-01-01T01:10:00.000Z");
    const operation = sampleOperation({
      progress: {
        syncTargetLease: {
          projectId: PRJ,
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 2,
        },
      },
    });

    expect(
      isOperationExecutionClaimExpired(
        operation,
        {
          target: {
            organizationId: ORG,
            projectId: PRJ,
            providerKind: "github-actions",
            targetIdentity: "acme/widget",
          },
          heldByOperationId: OP,
          fencingToken: 2,
          expiresAt: "2026-01-01T01:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
  });

  it("treats running operations without a deadline as live", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    expect(isOperationExecutionClaimExpired(sampleOperation(), null, now)).toBe(false);
  });

  it("no-ops parkAbandonedRunningOperation when the claim is still live", async () => {
    const operation = sampleOperation({
      executionDeadline: "2026-01-01T01:00:00.000Z",
    });
    const sql = createFakeTenantSql(() => {
      throw new Error("sql should not run when claim is live");
    });

    const result = await parkAbandonedRunningOperation(
      sql,
      operation,
      null,
      new Date("2026-01-01T00:10:00.000Z"),
    );
    expect(result).toBe(operation);
  });

  it("parks an expired non-lease running operation to incomplete with abandoned metadata", async () => {
    const operation = sampleOperation({
      executionDeadline: "2026-01-01T00:00:00.000Z",
    });
    const now = new Date("2026-01-01T00:10:00.000Z");

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update operations", "returning")) {
        return [
          operationRowFromPoll(operation, {
            state: "incomplete",
            progress: { abandoned: true, cause: "retryable" },
            execution_deadline: null,
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await parkAbandonedRunningOperation(sql, operation, null, now);
    expect(result.state).toBe("incomplete");
    expect(result.progress.abandoned).toBe(true);
    expect(result.progress.cause).toBe("retryable");
    expect(result.executionDeadline).toBeUndefined();
  });

  it("findActiveLeaseForOperation maps an active lease row to a snapshot", async () => {
    const leaseRow = activeLeaseRow("2026-01-01T01:00:00.000Z");
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [leaseRow];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const snapshot = await findActiveLeaseForOperation(sql, ORG, OP);
    expect(snapshot).toEqual({
      target: {
        organizationId: ORG,
        projectId: PRJ,
        providerKind: "github-actions",
        targetIdentity: "acme/widget",
      },
      heldByOperationId: OP,
      fencingToken: 2,
      expiresAt: "2026-01-01T01:00:00.000Z",
    });
  });

  it("resolveOperationLiveness parks abandoned running operations before returning", async () => {
    const operation = sampleOperation({
      executionDeadline: "2026-01-01T00:00:00.000Z",
    });
    const now = new Date("2026-01-01T00:10:00.000Z");

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      if (queryIncludes(query, "update operations", "returning")) {
        return [
          operationRowFromPoll(operation, {
            state: "incomplete",
            progress: { abandoned: true, cause: "retryable" },
            execution_deadline: null,
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await resolveOperationLiveness(sql, operation, now);
    expect(result.state).toBe("incomplete");
    expect(result.progress.abandoned).toBe(true);
  });

  it("resolveOperationLiveness returns the operation unchanged when still live", async () => {
    const operation = sampleOperation({
      executionDeadline: "2026-01-01T01:00:00.000Z",
    });
    const now = new Date("2026-01-01T00:10:00.000Z");

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await resolveOperationLiveness(sql, operation, now);
    expect(result).toBe(operation);
  });

  it("parkAbandonedRunningOperation no-ops when the operation is not running", async () => {
    const operation = sampleOperation({
      state: "pending",
      executionDeadline: "2026-01-01T00:00:00.000Z",
    });
    const now = new Date("2026-01-01T00:10:00.000Z");

    const sql = createFakeTenantSql(() => {
      throw new Error("sql should not run when source state is not running");
    });

    const result = await parkAbandonedRunningOperation(sql, operation, null, now);
    expect(result).toBe(operation);
  });

  it("parkAbandonedRunningOperation surfaces compare-and-set failures", async () => {
    const operation = sampleOperation({
      executionDeadline: "2026-01-01T00:00:00.000Z",
    });
    const now = new Date("2026-01-01T00:10:00.000Z");

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update operations")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(parkAbandonedRunningOperation(sql, operation, null, now)).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleTransition,
    });
  });
});
