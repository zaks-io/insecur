import { describe, expect, it } from "vitest";

import {
  assertCliAuditExportBundleMetadataOnly,
  assertCliAuditTailMetadataOnly,
  assertCliAuditVerifyExpectedResult,
  assertCliSecretsListMetadataOnly,
  assertCliSecretsVersionsMetadataOnly,
} from "../src/cli-audit-metadata-assertions";

describe("cli audit metadata assertions", () => {
  it("accepts metadata-only secrets list envelopes", () => {
    const secrets = assertCliSecretsListMetadataOnly(
      {
        ok: true,
        data: {
          secrets: [{ secretId: "sec_test", variableKey: "INSECUR_PROOF_SECRET" }],
        },
      },
      "CLI secrets list",
    );
    expect(secrets).toHaveLength(1);
  });

  it("accepts metadata-only secrets versions envelopes", () => {
    const { secretId, versions } = assertCliSecretsVersionsMetadataOnly(
      {
        ok: true,
        data: {
          secretId: "sec_test",
          variableKey: "INSECUR_PROOF_SECRET",
          versions: [{ secretVersionId: "secver_test", versionNumber: 1 }],
        },
      },
      "CLI secrets versions",
    );
    expect(secretId).toBe("sec_test");
    expect(versions).toHaveLength(1);
  });

  it("accepts metadata-only audit tail envelopes", () => {
    const events = assertCliAuditTailMetadataOnly(
      {
        ok: true,
        data: {
          events: [{ eventId: "evt_test", eventCode: "secret.write" }],
        },
      },
      "CLI audit tail",
    );
    expect(events).toHaveLength(1);
  });

  it("rejects audit export bundles with zero events for the smoke window", () => {
    expect(() => {
      assertCliAuditExportBundleMetadataOnly(
        {
          ok: true,
          data: {
            // Non-empty but unparseable-as-entries jsonl still yields zero entries.
            jsonl: "\n",
            manifest: { organization_id: "org_test", entry_count: 0 },
          },
        },
        "CLI audit export",
      );
    }).toThrow(/zero audit events/);
  });

  it("accepts a fully valid audit verify result", () => {
    assertCliAuditVerifyExpectedResult(
      {
        ok: true,
        data: {
          status: "valid",
          organizationId: "org_test",
          entryCount: 1,
          integrity: {
            hashChain: "valid",
            manifestHmac: "valid",
            signature: "valid",
            tenantScope: "valid",
          },
          failureCodes: [],
        },
      },
      "CLI audit verify",
      "org_test",
    );
  });

  it("accepts the preview-expected invalid result (missing HMAC key evidence)", () => {
    assertCliAuditVerifyExpectedResult(
      {
        ok: true,
        data: {
          status: "invalid",
          organizationId: "org_test",
          entryCount: 1,
          integrity: {
            hashChain: "valid",
            manifestHmac: "missing",
            signature: "valid",
            tenantScope: "valid",
          },
          failureCodes: ["audit.export.key_evidence_missing"],
        },
      },
      "CLI audit verify",
      "org_test",
    );
  });

  it("rejects audit verify results from the wrong organization", () => {
    expect(() => {
      assertCliAuditVerifyExpectedResult(
        {
          ok: true,
          data: {
            status: "valid",
            organizationId: "org_wrong",
            entryCount: 1,
            integrity: {
              hashChain: "valid",
              manifestHmac: "valid",
              signature: "valid",
              tenantScope: "valid",
            },
            failureCodes: [],
          },
        },
        "CLI audit verify",
        "org_test",
      );
    }).toThrow(/organizationId expected org_test, got org_wrong/);
  });

  it("rejects an invalid result whose real integrity checks regressed", () => {
    expect(() => {
      assertCliAuditVerifyExpectedResult(
        {
          ok: true,
          data: {
            status: "invalid",
            organizationId: "org_test",
            entryCount: 1,
            integrity: {
              hashChain: "invalid",
              manifestHmac: "missing",
              signature: "valid",
              tenantScope: "valid",
            },
            failureCodes: ["audit.export.hash_chain_mismatch", "audit.export.key_evidence_missing"],
          },
        },
        "CLI audit verify",
        "org_test",
      );
    }).toThrow(/integrity.hashChain/);
  });

  it("rejects an invalid result missing the expected failure code", () => {
    expect(() => {
      assertCliAuditVerifyExpectedResult(
        {
          ok: true,
          data: {
            status: "invalid",
            organizationId: "org_test",
            entryCount: 1,
            integrity: {
              hashChain: "valid",
              manifestHmac: "missing",
              signature: "valid",
              tenantScope: "valid",
            },
            failureCodes: [],
          },
        },
        "CLI audit verify",
        "org_test",
      );
    }).toThrow(/key_evidence_missing/);
  });
});
