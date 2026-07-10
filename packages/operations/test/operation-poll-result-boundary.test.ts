import { describe, expect, it } from "vitest";
import { OPERATION_INTENT_CODES } from "../src/operation-intent-codes.js";
import {
  type OperationRow,
  toOperationPollResult,
  toOperationRecord,
} from "../src/operation-row.js";

const ROW: OperationRow = {
  id: "op_00000000000000000000000001",
  org_id: "org_00000000000000000000000001",
  state: "running",
  intent_code: OPERATION_INTENT_CODES.syncRun,
  idempotency_key: null,
  progress: { counters: { step: 1 } },
  execution_deadline: "2026-01-01T00:10:00.000Z",
  revision: 7,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("public poll result boundary", () => {
  it("keeps the revision on the store-internal record", () => {
    expect(toOperationRecord(ROW).revision).toBe(7);
  });

  it("strips the internal revision and emits exactly the public key set", () => {
    const polled = toOperationPollResult(toOperationRecord(ROW));

    expect(polled).not.toHaveProperty("revision");
    expect(Object.keys(polled).sort()).toEqual([
      "createdAt",
      "executionDeadline",
      "intentCode",
      "operationId",
      "organizationId",
      "progress",
      "state",
      "updatedAt",
    ]);
  });

  it("emits the same public key set without an execution deadline", () => {
    const polled = toOperationPollResult(
      toOperationRecord({ ...ROW, state: "pending", execution_deadline: null }),
    );

    expect(Object.keys(polled).sort()).toEqual([
      "createdAt",
      "intentCode",
      "operationId",
      "organizationId",
      "progress",
      "state",
      "updatedAt",
    ]);
  });
});
