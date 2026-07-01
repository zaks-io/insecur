import { describe, expect, it } from "vitest";
import {
  assertMetadataSafeDetailMap,
  assertMetadataSafeDetailValue,
  isMetadataSafeDetailPrimitive,
  isMetadataSafeOpaqueTokenString,
  isMetadataSafeStringValue,
  isOpaqueResourceIdString,
} from "./metadata-safe-value.js";

describe("metadata-safe detail values", () => {
  it("accepts stable dotted codes and opaque resource IDs", () => {
    expect(isMetadataSafeStringValue("auth.insufficient_scope")).toBe(true);
    expect(isMetadataSafeStringValue("audit.gate.storage_security")).toBe(true);
    expect(isOpaqueResourceIdString("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E")).toBe(true);
    expect(isMetadataSafeStringValue("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E")).toBe(true);
  });

  it("rejects arbitrary free-form strings", () => {
    const freeForm = [
      "storage_security",
      "complete",
      "malformed",
      "Error: access denied",
      "secret value was invalid",
      "idem-1",
      "acme/widget",
      "",
    ];

    for (const value of freeForm) {
      expect(isMetadataSafeStringValue(value)).toBe(false);
    }
  });

  it("accepts numbers, booleans, and null primitives", () => {
    expect(isMetadataSafeDetailPrimitive(null)).toBe(true);
    expect(isMetadataSafeDetailPrimitive(false)).toBe(true);
    expect(isMetadataSafeDetailPrimitive(0)).toBe(true);
    expect(isMetadataSafeDetailPrimitive("sync.target_busy")).toBe(true);
  });

  it("rejects non-finite numbers and nested objects", () => {
    expect(isMetadataSafeDetailPrimitive(Number.NaN)).toBe(false);
    expect(isMetadataSafeDetailPrimitive({ nested: "auth.ok" })).toBe(false);
  });

  it("assertMetadataSafeDetailValue rejects free-form strings at construction", () => {
    expect(() => {
      assertMetadataSafeDetailValue("arbitrary secret text");
    }).toThrow(/must be a stable dotted code or opaque resource ID/);

    expect(() => {
      assertMetadataSafeDetailMap({ gate: "storage_security" });
    }).toThrow(/details.gate/);
  });

  it("assertMetadataSafeDetailMap accepts constrained detail maps", () => {
    expect(() => {
      assertMetadataSafeDetailMap({
        gate: "audit.gate.storage_security",
        retryable: false,
        count: 2,
        relatedId: "sec_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
      });
    }).not.toThrow();
  });

  it("accepts opaque token strings for idempotency-key-shaped metadata", () => {
    expect(isMetadataSafeOpaqueTokenString("idem-retry-1")).toBe(true);
    expect(isMetadataSafeOpaqueTokenString("operation.idempotency.idem_1")).toBe(true);
    expect(isMetadataSafeOpaqueTokenString("arbitrary secret text")).toBe(false);
    expect(isMetadataSafeOpaqueTokenString("")).toBe(false);
  });
});
