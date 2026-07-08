import { describe, expect, it } from "vitest";

import { parseExportSuccessEvidence, parseRestoreDrillEvidence } from "../src/parse-evidence.js";

function validExportEvidence() {
  return {
    status: "passed",
    checked_at: "2026-07-08T03:00:00.000Z",
    instance_id: "inst_1",
    export_timestamp: "2026-07-08T03:00:00.000Z",
    root_key_version: 1,
    organization_count: 2,
    artifact_ref: "backup/latest-export.ibkp",
    encryption_verified: true,
    expires_at: "2026-07-10T03:00:00.000Z",
  };
}

describe("parseExportSuccessEvidence", () => {
  it("parses a well-formed record and carries the optional operation_id", () => {
    const parsed = parseExportSuccessEvidence({
      ...validExportEvidence(),
      operation_id: "op_00000000000000000000000001",
    });
    expect(parsed?.status).toBe("passed");
    expect(parsed?.operation_id).toBe("op_00000000000000000000000001");
  });

  it("returns null for a non-record value", () => {
    expect(parseExportSuccessEvidence(null)).toBeNull();
    expect(parseExportSuccessEvidence("nope")).toBeNull();
    expect(parseExportSuccessEvidence(42)).toBeNull();
  });

  it("returns null when a required field is missing or the wrong type", () => {
    const { instance_id, ...withoutInstance } = validExportEvidence();
    void instance_id;
    expect(parseExportSuccessEvidence(withoutInstance)).toBeNull();
    expect(
      parseExportSuccessEvidence({ ...validExportEvidence(), encryption_verified: "yes" }),
    ).toBeNull();
    expect(
      parseExportSuccessEvidence({ ...validExportEvidence(), root_key_version: "1" }),
    ).toBeNull();
  });
});

describe("parseRestoreDrillEvidence", () => {
  it("returns null for a non-record value", () => {
    expect(parseRestoreDrillEvidence(null)).toBeNull();
    expect(parseRestoreDrillEvidence([])).toBeNull();
  });

  it("returns null when the scope block is incomplete", () => {
    expect(
      parseRestoreDrillEvidence({
        status: "passed",
        checked_at: "2026-07-08T03:00:00.000Z",
        actor: "ci",
        scope: { instance_id: "inst_1" },
        rto: {},
        canary_verification: {},
      }),
    ).toBeNull();
  });
});
