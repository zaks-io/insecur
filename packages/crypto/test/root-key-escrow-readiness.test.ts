import { describe, expect, it } from "vitest";

import {
  checkRootKeyEscrowReadiness,
  ROOT_KEY_ESCROW_EVIDENCE_PREFIX,
} from "../src/root-key-escrow-readiness.js";

describe("checkRootKeyEscrowReadiness", () => {
  it("passes when custody evidence uses the escrow-record prefix", () => {
    const ref = `${ROOT_KEY_ESCROW_EVIDENCE_PREFIX}instance/test/root/v1`;
    const report = checkRootKeyEscrowReadiness({
      rootKeyVersion: 1,
      custodyEvidenceRef: ref,
    });

    expect(report.status).toBe("ready");
    expect(report.custodyEvidenceRef).toBe(ref);
  });

  it("blocks when custody evidence is missing", () => {
    const report = checkRootKeyEscrowReadiness({
      rootKeyVersion: 1,
      custodyEvidenceRef: null,
    });

    expect(report.status).toBe("not_ready");
    expect(report.issues).toContainEqual({ code: "root_key_escrow.evidence_missing" });
  });

  it("blocks when custody evidence does not use the escrow prefix", () => {
    const report = checkRootKeyEscrowReadiness({
      rootKeyVersion: 1,
      custodyEvidenceRef: "file:///tmp/not-escrow",
    });

    expect(report.status).toBe("not_ready");
    expect(report.issues).toContainEqual({ code: "root_key_escrow.evidence_invalid" });
  });
});
