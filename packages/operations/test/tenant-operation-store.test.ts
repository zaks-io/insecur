import { organizationId, operationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_INTENT_CODES } from "../src/operation-intent-codes.js";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import type { OperationRecord, OperationRow } from "../src/operation-row.js";
import { TenantOperationStore } from "../src/tenant-operation-store.js";
import { createFakeTenantSql, queryIncludes } from "./helpers/fake-tenant-sql.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");

function sampleOperation(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    operationId: OP,
    organizationId: ORG,
    state: "running",
    intentCode: OPERATION_INTENT_CODES.syncRun,
    progress: {},
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function findBindingsProgressJson(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.includes("bindingsTotal")) {
      return value;
    }
  }
  return undefined;
}

function operationRowFromPoll(
  operation: OperationRecord,
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
    revision: operation.revision,
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

  it("recordProgress merges counters while preserving unrelated persisted progress fields", async () => {
    const operation = sampleOperation({
      state: "running",
      progress: {
        counters: { step: 1 },
        resultCode: "sync.partial_failure",
      },
    });
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
            progress: {
              counters: { step: 2, attempt: 1 },
              resultCode: "sync.partial_failure",
            },
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
    expect(result.progress.resultCode).toBe("sync.partial_failure");
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

  it("recordProgress compare-and-sets on the revision it read and bumps it", async () => {
    const operation = sampleOperation({ state: "running", revision: 7 });
    let updateQuery = "";
    let updateValues: readonly unknown[] = [];
    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (queryIncludes(query, "update operations", "returning")) {
        updateQuery = query;
        updateValues = values;
        return [operationRowFromPoll(operation, { revision: 8 })];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await store.recordProgress({
      organizationId: ORG,
      operationId: OP,
      progressPatch: { counters: { step: 1 } },
    });

    expect(queryIncludes(updateQuery, "revision = revision + 1")).toBe(true);
    expect(queryIncludes(updateQuery, "and revision =")).toBe(true);
    expect(updateValues).toContain(7);
  });

  it("recordProgress retries a revision conflict and re-merges the concurrent write", async () => {
    let reads = 0;
    let updates = 0;
    let secondUpdateValues: readonly unknown[] = [];
    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        reads += 1;
        if (reads === 1) {
          return [operationRowFromPoll(sampleOperation({ state: "running", revision: 1 }))];
        }
        return [
          operationRowFromPoll(
            sampleOperation({
              state: "running",
              revision: 2,
              progress: { counters: { other: 1 } },
            }),
          ),
        ];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (queryIncludes(query, "update operations", "returning")) {
        updates += 1;
        if (updates === 1) {
          return [];
        }
        secondUpdateValues = values;
        return [
          operationRowFromPoll(
            sampleOperation({
              state: "running",
              revision: 3,
              progress: { counters: { other: 1, mine: 1 } },
            }),
          ),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    const result = await store.recordProgress({
      organizationId: ORG,
      operationId: OP,
      progressPatch: { counters: { mine: 1 } },
    });

    expect(reads).toBe(2);
    expect(updates).toBe(2);
    expect(secondUpdateValues).toContain(2);
    const mergedJson = secondUpdateValues.find(
      (value) => typeof value === "string" && value.includes("counters"),
    );
    expect(mergedJson).toContain("other");
    expect(mergedJson).toContain("mine");
    expect(result.progress.counters).toEqual({ other: 1, mine: 1 });
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
        counters: { bindingsTotal: 2 },
      },
    });
    let terminalUpdateRan = false;
    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "update operations", "returning id")) {
        terminalUpdateRan = true;
        expect(values).toContain(OP);
        expect(values).toContain(ORG);
        expect(values).toContain("succeeded");
        const progressJson = findBindingsProgressJson(values);
        expect(progressJson).toBe(JSON.stringify({ counters: { bindingsTotal: 2 } }));
        return [{ id: OP }];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await store.clearSyncTargetLeaseBinding({
      organizationId: ORG,
      operationId: OP,
    });

    expect(terminalUpdateRan).toBe(true);
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

  it("clearExecutionDeadline scopes the update by operation id and organization id", async () => {
    const otherOrg = organizationId.brand("org_00000000000000000000000002");
    const sql = createFakeTenantSql((query, values) => {
      if (queryIncludes(query, "update operations", "execution_deadline")) {
        expect(values).toContain(OP);
        expect(values).toContain(ORG);
        expect(values).not.toContain(otherOrg);
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await store.clearExecutionDeadline({
      organizationId: ORG,
      operationId: OP,
    });
  });

  it("recordClearHighAssuranceProgress merges cleared evidence when compare-and-set succeeds", async () => {
    const pendingEvidence = {
      challengeId: "challenge_test_token_001",
      riskReasonCode: "high_assurance.risk.agent_step_up",
      projectId: PRJ,
      requestingUserId: "usr_00000000000000000000000001",
      requestedAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      requestAuditEventId: "aud_00000000000000000000000001",
    };
    const operation = sampleOperation({
      state: "waiting_for_human",
      progress: { highAssuranceChallenge: pendingEvidence },
    });

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (
        queryIncludes(query, "update operations") &&
        queryIncludes(query, "highassurancechallenge", "clearedat")
      ) {
        return [
          operationRowFromPoll(operation, {
            progress: {
              highAssuranceChallenge: {
                ...pendingEvidence,
                clearedAt: "2026-07-03T00:05:00.000Z",
                clearingUserId: "usr_00000000000000000000000001",
                clearAuthenticationMethodCode: "auth.assurance.passkey",
                clearAuditEventId: "aud_00000000000000000000000002",
              },
            },
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    const result = await store.recordClearHighAssuranceProgress({
      organizationId: ORG,
      operationId: OP,
      challengeId: pendingEvidence.challengeId,
      progressPatch: {
        highAssuranceChallenge: {
          ...pendingEvidence,
          clearedAt: "2026-07-03T00:05:00.000Z",
          clearingUserId: "usr_00000000000000000000000001",
          clearAuthenticationMethodCode: "auth.assurance.passkey",
          clearAuditEventId: "aud_00000000000000000000000002",
        },
      },
    });

    expect(result.progress.highAssuranceChallenge?.clearedAt).toBe("2026-07-03T00:05:00.000Z");
  });

  it("recordClearHighAssuranceProgress rejects compare-and-set when evidence is already cleared", async () => {
    const clearedEvidence = {
      challengeId: "challenge_test_token_001",
      riskReasonCode: "high_assurance.risk.agent_step_up",
      projectId: PRJ,
      requestingMachineIdentityId: "mach_00000000000000000000000001",
      requestedAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      requestAuditEventId: "aud_00000000000000000000000001",
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: "usr_00000000000000000000000001",
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: "aud_00000000000000000000000002",
    };
    const operation = sampleOperation({
      state: "waiting_for_human",
      progress: { highAssuranceChallenge: clearedEvidence },
    });

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from operations", "limit 1")) {
        return [operationRowFromPoll(operation)];
      }
      if (queryIncludes(query, "from sync_target_leases")) {
        return [];
      }
      if (
        queryIncludes(query, "update operations") ||
        queryIncludes(query, "highassurancechallenge", "clearedat")
      ) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantOperationStore(sql);

    await expect(
      store.recordClearHighAssuranceProgress({
        organizationId: ORG,
        operationId: OP,
        challengeId: clearedEvidence.challengeId,
        progressPatch: {
          highAssuranceChallenge: {
            ...clearedEvidence,
            clearingUserId: "usr_00000000000000000000000002",
            clearAuditEventId: "aud_00000000000000000000000003",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleTransition,
      retryable: true,
    });
  });

  it("recordClearHighAssuranceProgress rejects non-waiting_for_human operations", async () => {
    const operation = sampleOperation({ state: "running" });
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
      store.recordClearHighAssuranceProgress({
        organizationId: ORG,
        operationId: OP,
        challengeId: "challenge_test_token_001",
        progressPatch: {},
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidTransition,
    });
  });
});
