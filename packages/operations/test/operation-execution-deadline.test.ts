import { describe, expect, it } from "vitest";
import { organizationId, operationId } from "@insecur/domain";
import {
  computeNonLeaseExecutionDeadline,
  DEFAULT_NON_LEASE_EXECUTION_DEADLINE_SECONDS,
  isIsoTimestampExpired,
} from "../src/operation-execution-deadline.js";
import { isOperationExecutionClaimExpired } from "../src/resolve-operation-liveness.js";
import type { OperationPollResult } from "../src/operation-types.js";

function sampleOperation(overrides: Partial<OperationPollResult> = {}): OperationPollResult {
  return {
    operationId: operationId.brand("op_00000000000000000000000001"),
    organizationId: organizationId.brand("org_00000000000000000000000001"),
    state: "running",
    intentCode: "provider.reauth",
    progress: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("operation execution deadline helpers", () => {
  it("computes a future deadline from the default ttl", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const deadline = computeNonLeaseExecutionDeadline(now);
    expect(deadline).toBe(
      new Date(now.getTime() + DEFAULT_NON_LEASE_EXECUTION_DEADLINE_SECONDS * 1000).toISOString(),
    );
  });

  it("detects expired non-lease claims only for running operations", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const expired = sampleOperation({
      executionDeadline: "2026-01-01T00:00:00.000Z",
    });
    expect(isOperationExecutionClaimExpired(expired, null, now)).toBe(true);
    expect(
      isOperationExecutionClaimExpired(
        sampleOperation({ state: "incomplete", executionDeadline: "2026-01-01T00:00:00.000Z" }),
        null,
        now,
      ),
    ).toBe(false);
  });

  it("uses the active lease expiry instead of execution_deadline", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const operation = sampleOperation({
      executionDeadline: "2026-01-01T00:00:00.000Z",
      progress: {
        syncTargetLease: {
          projectId: "prj_00000000000000000000000001",
          providerKind: "github-actions",
          targetIdentity: "repo/env",
          fencingToken: 1,
        },
      },
    });
    expect(
      isOperationExecutionClaimExpired(
        operation,
        {
          target: {
            organizationId: operation.organizationId,
            projectId: "prj_00000000000000000000000001",
            providerKind: "github-actions",
            targetIdentity: "repo/env",
          },
          heldByOperationId: operation.operationId,
          fencingToken: 1,
          expiresAt: "2026-01-01T01:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
    expect(isIsoTimestampExpired("2026-01-01T00:00:00.000Z", now)).toBe(true);
  });
});
