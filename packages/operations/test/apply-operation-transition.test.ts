import { organizationId, operationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { casApplyOperationTransition } from "../src/apply-operation-transition.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../src/operation-errors.js";
import type { OperationRow } from "../src/operation-row.js";
import type { OperationPollResult } from "../src/operation-types.js";
import type { SyncTargetLeaseRow } from "../src/sync-target-lease-row.js";
import { createFakeTenantSql, queryIncludes } from "./helpers/fake-tenant-sql.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");

function sampleOperation(overrides: Partial<OperationPollResult> = {}): OperationPollResult {
  return {
    operationId: OP,
    organizationId: ORG,
    state: "pending",
    intentCode: "sync.run",
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

function findIsoDeadline(values: readonly unknown[]): string {
  const deadline = values.find((value) => typeof value === "string" && value.includes("T"));
  return typeof deadline === "string" ? deadline : "2026-01-01T00:10:00.000Z";
}

function createLegalTransitionSql(
  current: OperationPollResult,
  rowOverrides: Partial<OperationRow> = {},
) {
  return createFakeTenantSql((query, values) => {
    if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
      return [];
    }
    if (queryIncludes(query, "update operations", "returning")) {
      return [
        operationRowFromPoll(current, {
          state: "running",
          progress: { counters: { step: 1 } },
          execution_deadline: findIsoDeadline(values),
          ...rowOverrides,
        }),
      ];
    }
    throw new Error(`unexpected query: ${query}`);
  });
}

describe("casApplyOperationTransition", () => {
  it("applies a legal transition and returns the updated operation", async () => {
    const current = sampleOperation({ state: "pending" });
    const sql = createLegalTransitionSql(current);

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "running",
      progressPatch: { counters: { step: 1 } },
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: (state) => `not allowed from ${state}`,
      },
    });

    expect(result.state).toBe("running");
    expect(result.progress.counters).toEqual({ step: 1 });
    expect(result.executionDeadline).toBeDefined();
  });

  it("rejects transitions from states outside legalFromStates", async () => {
    const current = sampleOperation({ state: "blocked" });
    const sql = createFakeTenantSql(() => []);

    await expect(
      casApplyOperationTransition(sql, current, {
        organizationId: ORG,
        operationId: OP,
        nextState: "running",
        progressPatch: {},
        legalFromStates: new Set(["incomplete"]),
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: () => "retry only allowed from incomplete",
        },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidTransition,
      message: "retry only allowed from incomplete",
    });
  });

  it("rejects transitions from terminal states", async () => {
    const current = sampleOperation({ state: "succeeded" });
    const sql = createFakeTenantSql(() => []);

    await expect(
      casApplyOperationTransition(sql, current, {
        organizationId: ORG,
        operationId: OP,
        nextState: "running",
        progressPatch: {},
        legalFromStates: "by-transition-table",
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: (state) => `blocked from ${state}`,
        },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.terminalState,
    });
  });

  it("rejects transitions disallowed by the transition table", async () => {
    const current = sampleOperation({ state: "pending" });
    const sql = createFakeTenantSql(() => []);

    await expect(
      casApplyOperationTransition(sql, current, {
        organizationId: ORG,
        operationId: OP,
        nextState: "succeeded",
        progressPatch: {},
        legalFromStates: "by-transition-table",
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: (state) => `not allowed: ${state}`,
        },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidTransition,
      message: "operation transition not allowed: pending -> succeeded",
    });
  });

  it("returns the current operation on idempotent replay", async () => {
    const current = sampleOperation({
      state: "running",
      progress: {
        mutationIdempotencyKey: "idem-retry-1",
        counters: { attempt: 2 },
      },
    });
    const sql = createFakeTenantSql(() => {
      throw new Error("sql should not run on idempotent replay");
    });

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "running",
      progressPatch: { counters: { attempt: 3 } },
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: () => "not allowed",
      },
      idempotency: {
        key: "idem-retry-1",
        alreadyAppliedWhen: (operation) => operation.state === "running",
      },
    });

    expect(result).toBe(current);
  });

  it("throws stale_transition when compare-and-set loses a concurrent write", async () => {
    const current = sampleOperation({ state: "running" });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (queryIncludes(query, "update operations")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(
      casApplyOperationTransition(sql, current, {
        organizationId: ORG,
        operationId: OP,
        nextState: "incomplete",
        progressPatch: { cause: "retryable" },
        legalFromStates: "by-transition-table",
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: () => "not allowed",
        },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleTransition,
      retryable: true,
    });
  });

  it("clears execution_deadline when leaving running without an explicit override", async () => {
    const current = sampleOperation({
      state: "running",
      executionDeadline: "2026-01-01T00:10:00.000Z",
    });

    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "update operations")) {
        const deadline = values.find((value) => value === null);
        expect(deadline).toBeNull();
        return [
          operationRowFromPoll(current, {
            state: "incomplete",
            execution_deadline: null,
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "incomplete",
      progressPatch: { cause: "retryable" },
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: () => "not allowed",
      },
    });

    expect(result.state).toBe("incomplete");
    expect(result.executionDeadline).toBeUndefined();
  });

  it("honors an explicit executionDeadline override", async () => {
    const current = sampleOperation({ state: "running" });
    const override = "2026-01-01T01:00:00.000Z";

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update operations")) {
        return [
          operationRowFromPoll(current, {
            state: "blocked",
            execution_deadline: override,
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "blocked",
      progressPatch: {},
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: () => "not allowed",
      },
      executionDeadline: override,
    });

    expect(result.executionDeadline).toBe(override);
  });

  it("skips non-lease deadline when an active sync target lease exists", async () => {
    const current = sampleOperation({ state: "pending" });
    const leaseRow: SyncTargetLeaseRow = {
      org_id: ORG,
      project_id: projectId.brand("prj_00000000000000000000000001"),
      provider_kind: "github-actions",
      target_identity: "acme/widget",
      held_by_operation_id: OP,
      fencing_token: "1",
      expires_at: "2026-01-01T01:00:00.000Z",
    };

    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [leaseRow];
      }
      if (queryIncludes(query, "update operations")) {
        expect(values).toContain(null);
        return [operationRowFromPoll(current, { state: "running", execution_deadline: null })];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "running",
      progressPatch: {},
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: () => "not allowed",
      },
    });

    expect(result.state).toBe("running");
    expect(result.executionDeadline).toBeUndefined();
  });

  it("skips non-lease deadline when progress already carries syncTargetLease metadata", async () => {
    const current = sampleOperation({
      state: "pending",
      progress: {
        syncTargetLease: {
          projectId: projectId.brand("prj_00000000000000000000000001"),
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 1,
        },
      },
    });

    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (queryIncludes(query, "update operations")) {
        expect(values).toContain(null);
        return [operationRowFromPoll(current, { state: "running", execution_deadline: null })];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "running",
      progressPatch: {},
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: () => "not allowed",
      },
    });

    expect(result.executionDeadline).toBeUndefined();
  });

  it("preserves execution_deadline when transitioning between non-running states", async () => {
    const deadline = "2026-01-01T00:30:00.000Z";
    const current = sampleOperation({
      state: "blocked",
      executionDeadline: deadline,
    });

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update operations")) {
        return [
          operationRowFromPoll(current, {
            state: "canceled",
            execution_deadline: deadline,
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await casApplyOperationTransition(sql, current, {
      organizationId: ORG,
      operationId: OP,
      nextState: "canceled",
      progressPatch: {},
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: () => "not allowed",
      },
    });

    expect(result.executionDeadline).toBe(deadline);
  });

  it("rejects invalid metadata before attempting compare-and-set", async () => {
    const current = sampleOperation({ state: "running" });
    const sql = createFakeTenantSql(() => {
      throw new Error("sql should not run when metadata validation fails");
    });

    await expect(
      casApplyOperationTransition(sql, current, {
        organizationId: ORG,
        operationId: OP,
        nextState: "incomplete",
        progressPatch: { counters: { bad: -1 } },
        legalFromStates: "by-transition-table",
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: () => "not allowed",
        },
      }),
    ).rejects.toBeInstanceOf(OperationStoreError);
  });
});
