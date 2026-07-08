import { describe, expect, it } from "vitest";

import {
  deriveStorageGateDeliveryError,
  deriveStorageGateVerdictStatus,
  isStorageGateDeliveryBlocking,
  STORAGE_GATE_ERROR_CODES,
  STORAGE_SECURITY_GATE_CONTROL_IDS,
} from "./index.js";
import type { StorageGateControl } from "./types.js";

function control(
  id: (typeof STORAGE_SECURITY_GATE_CONTROL_IDS)[number],
  status: StorageGateControl["status"],
): StorageGateControl {
  return {
    id,
    status,
    summary: `${id} ${status}`,
    evidence: [],
    checked_at: "2026-07-08T00:00:00.000Z",
  };
}

describe("deriveStorageGateVerdictStatus", () => {
  it("returns passed when every control passed", () => {
    const controls = STORAGE_SECURITY_GATE_CONTROL_IDS.map((id) => control(id, "passed"));
    expect(deriveStorageGateVerdictStatus(controls)).toBe("passed");
  });

  it("returns blocked when any control is blocked", () => {
    const controls = STORAGE_SECURITY_GATE_CONTROL_IDS.map((id, index) =>
      control(id, index === 0 ? "blocked" : "passed"),
    );
    expect(deriveStorageGateVerdictStatus(controls)).toBe("blocked");
  });

  it("returns unknown when no control is blocked but at least one is unknown", () => {
    const controls = STORAGE_SECURITY_GATE_CONTROL_IDS.map((id, index) =>
      control(id, index === 2 ? "unknown" : "passed"),
    );
    expect(deriveStorageGateVerdictStatus(controls)).toBe("unknown");
  });

  it("prefers blocked over unknown when both are present", () => {
    const controls = STORAGE_SECURITY_GATE_CONTROL_IDS.map((id, index) => {
      if (index === 0) {
        return control(id, "blocked");
      }
      if (index === 1) {
        return control(id, "unknown");
      }
      return control(id, "passed");
    });
    expect(deriveStorageGateVerdictStatus(controls)).toBe("blocked");
  });
});

describe("delivery blocking", () => {
  it("blocks production delivery for blocked and unknown verdicts", () => {
    expect(isStorageGateDeliveryBlocking("passed")).toBe(false);
    expect(isStorageGateDeliveryBlocking("blocked")).toBe(true);
    expect(isStorageGateDeliveryBlocking("unknown")).toBe(true);
  });

  it("maps blocked and unknown statuses to stable delivery error codes", () => {
    expect(deriveStorageGateDeliveryError("passed")).toBeUndefined();
    expect(deriveStorageGateDeliveryError("blocked")).toBe(STORAGE_GATE_ERROR_CODES.gateBlocked);
    expect(deriveStorageGateDeliveryError("unknown")).toBe(STORAGE_GATE_ERROR_CODES.gateUnknown);
  });
});
