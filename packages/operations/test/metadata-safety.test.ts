import { auditEventId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OperationStoreError } from "../src/operation-errors.js";
import {
  validateOperationIntentCode,
  validateOperationProgress,
} from "../src/validate-operation-metadata.js";

describe("operation metadata safety", () => {
  it("accepts metadata-only progress with audit references", () => {
    expect(() => {
      validateOperationProgress({
        auditEventIds: [auditEventId.brand("aud_00000000000000000000000001")],
        counters: { bindingsTotal: 3, bindingsSucceeded: 1 },
        providerStatusCode: "sync.target_busy",
        wait: { reasonCode: "auth.high_assurance_required" },
      });
    }).not.toThrow();
  });

  it("rejects non-dotted intent codes", () => {
    expect(() => validateOperationIntentCode("SYNC_RUN")).toThrow(OperationStoreError);
  });

  it("rejects forbidden sensitive-value keys", () => {
    expect(() => {
      validateOperationProgress({
        value: "must-not-appear",
      } as never);
    }).toThrow(/progress contains unknown field: value/);

    expect(() => {
      validateOperationProgress({
        counters: { bindingsTotal: 1 },
        plaintext: "nope",
      } as never);
    }).toThrow(/progress contains unknown field: plaintext/);
  });

  it("rejects binary payloads", () => {
    expect(() => {
      validateOperationProgress({
        wrappedValue: new Uint8Array([1, 2, 3]),
      } as never);
    }).toThrow(/progress contains unknown field: wrappedValue/);
  });
});
