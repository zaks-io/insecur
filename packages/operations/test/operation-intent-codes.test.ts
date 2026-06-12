import { organizationId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { createOperation } from "../src/create-operation.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../src/operation-errors.js";
import { OPERATION_INTENT_CODES, isOperationIntentCode } from "../src/operation-intent-codes.js";
import { validateOperationIntentCode } from "../src/validate-operation-metadata.js";

const ORG = organizationId.brand("org_00000000000000000000000001");

describe("OPERATION_INTENT_CODES", () => {
  it("accepts registered intent codes", () => {
    for (const intentCode of Object.values(OPERATION_INTENT_CODES)) {
      expect(isOperationIntentCode(intentCode)).toBe(true);
      expect(() => validateOperationIntentCode(intentCode)).not.toThrow();
    }
  });

  it("rejects well-shaped but unregistered intent codes", () => {
    expect(() => validateOperationIntentCode("sync.not_registered")).toThrow(OperationStoreError);
    expect(() => validateOperationIntentCode("sync.not_registered")).toThrow(
      expect.objectContaining({
        code: OPERATION_ERROR_CODES.invalidIntent,
        message: "unknown intentCode: sync.not_registered",
      }),
    );
  });

  it("rejects malformed intent codes before membership", () => {
    expect(() => validateOperationIntentCode("SYNC_RUN")).toThrow(OperationStoreError);
    expect(() => validateOperationIntentCode("SYNC_RUN")).toThrow(
      expect.objectContaining({
        code: OPERATION_ERROR_CODES.invalidIntent,
        message: "intentCode must be a stable dotted code (e.g. sync.run)",
      }),
    );
  });

  it("createOperation rejects unregistered intent codes before persistence", async () => {
    await expect(
      createOperation({
        organizationId: ORG,
        intentCode: "sync.not_registered",
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidIntent,
      message: "unknown intentCode: sync.not_registered",
    });
  });
});
