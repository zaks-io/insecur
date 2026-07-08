import { describe, expect, it } from "vitest";
import {
  AUDIT_EXPORT_CLAIM_CEILING,
  AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION,
  AUDIT_EXPORT_SIGNATURE_ALGORITHM,
  parseAuditExportPublishedSigningKeys,
  registerPublishedSigningKeys,
  StaticAuditExportVerificationKeys,
} from "../src/index.js";

describe("audit export published signing keys", () => {
  const sampleDocument = {
    schema_version: AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION,
    algorithm: AUDIT_EXPORT_SIGNATURE_ALGORITHM,
    current_version: 2,
    claim_ceiling: AUDIT_EXPORT_CLAIM_CEILING,
    keys: [
      {
        version: 1,
        public_key_base64url: "retired-public-key",
        custody_evidence_ref: "escrow-record://instance/test/audit-signing/v1",
        retired_at: "2026-06-01T00:00:00.000Z",
      },
      {
        version: 2,
        public_key_base64url: "current-public-key",
        custody_evidence_ref: "escrow-record://instance/test/audit-signing/v2",
        active_since: "2026-06-01T00:00:00.000Z",
      },
    ],
  };

  it("parses and registers current and historical public keys", () => {
    const published = parseAuditExportPublishedSigningKeys(sampleDocument);
    expect(published.current_version).toBe(2);
    expect(published.keys).toHaveLength(2);

    const verificationKeys = new StaticAuditExportVerificationKeys();
    registerPublishedSigningKeys(verificationKeys, published);
    expect(verificationKeys.getSigningPublicKeyBase64Url(1)).toBe("retired-public-key");
    expect(verificationKeys.getSigningPublicKeyBase64Url(2)).toBe("current-public-key");
  });

  it("rejects documents with an invalid claim ceiling", () => {
    expect(() =>
      parseAuditExportPublishedSigningKeys({
        ...sampleDocument,
        claim_ceiling: "tamper-proof",
      }),
    ).toThrow(/claim_ceiling/);
  });
});
