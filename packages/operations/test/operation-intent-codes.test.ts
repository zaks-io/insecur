import { describe, expect, it } from "vitest";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../src/operation-errors.js";
import { OPERATION_INTENT_CODES, isOperationIntentCode } from "../src/operation-intent-codes.js";
import { validateOperationIntentCode } from "../src/validate-operation-metadata.js";

describe("OPERATION_INTENT_CODES", () => {
  it("accepts registered intent codes", () => {
    for (const intentCode of Object.values(OPERATION_INTENT_CODES)) {
      expect(isOperationIntentCode(intentCode)).toBe(true);
      expect(() => validateOperationIntentCode(intentCode)).not.toThrow();
    }
  });

  it("rejects unregistered values from isOperationIntentCode", () => {
    expect(isOperationIntentCode("sync.not_registered")).toBe(false);
    expect(isOperationIntentCode("")).toBe(false);
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
});
