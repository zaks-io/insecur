import { organizationId, operationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_INTENT_CODES } from "../src/operation-intent-codes.js";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import type { OperationRow } from "../src/operation-row.js";
import type { OperationPollResult } from "../src/operation-types.js";
import { TenantOperationStore } from "../src/tenant-operation-store.js";
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

describe("TenantOperationStore", () => {
  it("returns null from getById when the operation does not exist", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(store.getById(ORG, OP)).resolves.toBeNull();
  });

  it("resolves liveness before returning getById results", async () => {
    const operation = sampleOperation({
      state: "running",
      executionDeadline: "2026-01-01T00:00:00.000Z",
    });

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
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
    const store = new TenantOperationStore(sql);

    const result = await store.getById(ORG, OP);
    expect(result?.state).toBe("incomplete");
    expect(result?.progress.abandoned).toBe(true);
  });

  it("findByIdempotencyKey returns null when no row matches", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "idempotency_key")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(store.findByIdempotencyKey(ORG, "missing-key")).resolves.toBeNull();
  });

  it("applyTransition rejects missing operations", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.applyTransition({
        organizationId: ORG,
        operationId: OP,
        nextState: "running",
        progressPatch: {},
        legalFromStates: "by-transition-table",
        notAllowedError: {
          code: OPERATION_ERROR_CODES.invalidTransition,
          message: () => "not allowed",
        },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.notFound,
    });
  });

  it("recordProgress rejects missing operations", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.recordProgress({
        organizationId: ORG,
        operationId: OP,
        progressPatch: { counters: { step: 1 } },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.notFound,
    });
  });

  it("recordProgress rejects terminal operations", async () => {
    const operation = sampleOperation({ state: "succeeded" });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.recordProgress({
        organizationId: ORG,
        operationId: OP,
        progressPatch: { counters: { step: 1 } },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.terminalState,
    });
  });

  it("recordProgress merges and persists metadata-safe progress", async () => {
    const operation = sampleOperation({ state: "running", progress: { counters: { step: 1 } } });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (queryIncludes(query, "update operations", "returning")) {
        return [
          operationRowFromPoll(operation, {
            progress: { counters: { step: 2, attempt: 1 } },
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    const result = await store.recordProgress({
      organizationId: ORG,
      operationId: OP,
      progressPatch: { counters: { step: 2, attempt: 1 } },
    });

    expect(result.progress.counters).toEqual({ step: 2, attempt: 1 });
  });

  it("recordProgress surfaces stale compare-and-set failures", async () => {
    const operation = sampleOperation({ state: "running" });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (queryIncludes(query, "update operations")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.recordProgress({
        organizationId: ORG,
        operationId: OP,
        progressPatch: { counters: { step: 2 } },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleTransition,
      retryable: true,
    });
  });

  it("clearSyncTargetLeaseBinding no-ops when no lease metadata is present", async () => {
    const operation = sampleOperation({ state: "running" });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.clearSyncTargetLeaseBinding({
        organizationId: ORG,
        operationId: OP,
      }),
    ).resolves.toBeUndefined();
  });

  it("clearSyncTargetLeaseBinding clears lease metadata on terminal operations", async () => {
    const operation = sampleOperation({
      state: "succeeded",
      progress: {
        syncTargetLease: {
          projectId: PRJ,
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 1,
        },
      },
    });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "update operations", "returning id")) {
        return [{ id: OP }];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await store.clearSyncTargetLeaseBinding({
      organizationId: ORG,
      operationId: OP,
    });
  });

  it("clearSyncTargetLeaseBinding rejects missing operations", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.clearSyncTargetLeaseBinding({
        organizationId: ORG,
        operationId: OP,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.notFound,
    });
  });

  it("clearExecutionDeadline updates the operation row", async () => {
    let updated = false;
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update operations", "execution_deadline")) {
        updated = true;
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await store.clearExecutionDeadline({
      organizationId: ORG,
      operationId: OP,
    });
    expect(updated).toBe(true);
  });
});
