import { organizationId, operationId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { insertOperation, insertOperationStart } from "../src/insert-operation-row.js";
import { OPERATION_INTENT_CODES } from "../src/operation-intent-codes.js";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import type { OperationRow } from "../src/operation-row.js";
import { createFakeTenantSql, queryIncludes } from "./helpers/fake-tenant-sql.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const OP_NEW = operationId.brand("op_00000000000000000000000001");
const OP_EXISTING = operationId.brand("op_00000000000000000000000002");

function operationRow(overrides: Partial<OperationRow> = {}): OperationRow {
  return {
    id: OP_NEW,
    org_id: ORG,
    state: "pending",
    intent_code: OPERATION_INTENT_CODES.syncRun,
    idempotency_key: null,
    progress: {},
    execution_deadline: null,
    revision: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("insertOperationStart", () => {
  it("inserts a new operation when no idempotency key is provided", async () => {
    const row = operationRow();
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "insert into operations", "returning")) {
        return [row];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await insertOperationStart(sql, {
      operationId: OP_NEW,
      organizationId: ORG,
      intentCode: OPERATION_INTENT_CODES.syncRun,
      progress: {},
    });

    expect(result.created).toBe(true);
    expect(result.operation.operationId).toBe(OP_NEW);
    expect(result.operation.state).toBe("pending");
  });

  it("rejects invalid progress before touching the database", async () => {
    const sql = createFakeTenantSql(() => {
      throw new Error("sql should not run when progress validation fails");
    });

    await expect(
      insertOperationStart(sql, {
        operationId: OP_NEW,
        organizationId: ORG,
        intentCode: OPERATION_INTENT_CODES.syncRun,
        progress: { counters: { bad: -1 } },
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidMetadata,
    });
  });

  it("returns created=true when idempotent upsert inserts a new row", async () => {
    const row = operationRow({ idempotency_key: "idem-create-1" });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "on conflict", "returning")) {
        return [row];
      }
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await insertOperationStart(sql, {
      operationId: OP_NEW,
      organizationId: ORG,
      intentCode: OPERATION_INTENT_CODES.syncRun,
      idempotencyKey: "idem-create-1",
      progress: {},
    });

    expect(result.created).toBe(true);
    expect(result.operation.operationId).toBe(OP_NEW);
  });

  it("returns created=false and the existing row when idempotent upsert conflicts", async () => {
    const row = operationRow({
      id: OP_EXISTING,
      idempotency_key: "idem-replay-1",
      intent_code: OPERATION_INTENT_CODES.syncRun,
    });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "on conflict", "returning")) {
        return [row];
      }
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await insertOperationStart(sql, {
      operationId: OP_NEW,
      organizationId: ORG,
      intentCode: OPERATION_INTENT_CODES.syncRun,
      idempotencyKey: "idem-replay-1",
      progress: {},
    });

    expect(result.created).toBe(false);
    expect(result.operation.operationId).toBe(OP_EXISTING);
  });

  it("rejects idempotency key reuse with a different intent code on upsert conflict", async () => {
    const row = operationRow({
      id: OP_EXISTING,
      idempotency_key: "idem-intent-mismatch",
      intent_code: OPERATION_INTENT_CODES.providerReauth,
    });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "on conflict", "returning")) {
        return [row];
      }
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(
      insertOperationStart(sql, {
        operationId: OP_NEW,
        organizationId: ORG,
        intentCode: OPERATION_INTENT_CODES.syncRun,
        idempotencyKey: "idem-intent-mismatch",
        progress: {},
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.idempotencyMismatch,
      message: "idempotency key reused with a different intent code",
    });
  });

  it("falls back to selectByIdempotencyKey after a unique constraint race", async () => {
    const existingRow = operationRow({
      id: OP_EXISTING,
      idempotency_key: "idem-race-1",
      intent_code: OPERATION_INTENT_CODES.syncRun,
    });
    let upsertAttempted = false;

    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "on conflict", "returning")) {
        upsertAttempted = true;
        throw { code: "23505" };
      }
      if (queryIncludes(query, "select", "idempotency_key", "limit 1")) {
        return [existingRow];
      }
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await insertOperationStart(sql, {
      operationId: OP_NEW,
      organizationId: ORG,
      intentCode: OPERATION_INTENT_CODES.syncRun,
      idempotencyKey: "idem-race-1",
      progress: {},
    });

    expect(upsertAttempted).toBe(true);
    expect(result.created).toBe(false);
    expect(result.operation.operationId).toBe(OP_EXISTING);
  });

  it("rethrows unique constraint violations when the idempotency row cannot be found", async () => {
    const raceError = { code: "23505" };
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "on conflict", "returning")) {
        throw raceError;
      }
      if (queryIncludes(query, "select", "idempotency_key", "limit 1")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(
      insertOperationStart(sql, {
        operationId: OP_NEW,
        organizationId: ORG,
        intentCode: OPERATION_INTENT_CODES.syncRun,
        idempotencyKey: "idem-missing-after-race",
        progress: {},
      }),
    ).rejects.toBe(raceError);
  });

  it("rejects intent mismatch on unique constraint fallback select", async () => {
    const existingRow = operationRow({
      id: OP_EXISTING,
      idempotency_key: "idem-race-intent",
      intent_code: OPERATION_INTENT_CODES.providerReauth,
    });
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "on conflict", "returning")) {
        throw { code: "23505" };
      }
      if (queryIncludes(query, "select", "idempotency_key", "limit 1")) {
        return [existingRow];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(
      insertOperationStart(sql, {
        operationId: OP_NEW,
        organizationId: ORG,
        intentCode: OPERATION_INTENT_CODES.syncRun,
        idempotencyKey: "idem-race-intent",
        progress: {},
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.idempotencyMismatch,
    });
  });
});

describe("insertOperation", () => {
  it("returns only the operation poll result", async () => {
    const row = operationRow();
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "insert into operations", "returning")) {
        return [row];
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const operation = await insertOperation(sql, {
      operationId: OP_NEW,
      organizationId: ORG,
      intentCode: OPERATION_INTENT_CODES.syncRun,
      progress: {},
    });

    expect(operation.operationId).toBe(OP_NEW);
    expect(operation).not.toHaveProperty("created");
  });
});
