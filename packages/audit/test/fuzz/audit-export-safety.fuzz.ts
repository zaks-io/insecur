import { FORBIDDEN_ENVELOPE_KEYS } from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AUDIT_EXPORT_HASH_ALGORITHM,
  AUDIT_EXPORT_SCHEMA_VERSION,
  AUDIT_EXPORT_SIGNATURE_ALGORITHM,
} from "../../src/audit-export-constants.js";
import { scanAuditExportForForbiddenSensitiveValues } from "../../src/audit-export-event.js";
import { validateAuditExportManifest } from "../../src/parse-audit-export-manifest.js";

const forbiddenKeyArb = fc.constantFrom(...FORBIDDEN_ENVELOPE_KEYS);
const orgIdArb = fc
  .array(fc.integer({ min: 0, max: 35 }), { minLength: 26, maxLength: 26 })
  .map((digits) => `org_${digits.map((digit) => digit.toString(36).toUpperCase()).join("")}`);
const validManifestArb = fc.record({
  schema_version: fc.constant(AUDIT_EXPORT_SCHEMA_VERSION),
  organization_id: orgIdArb,
  time_range: fc.record({
    from: fc.constant("2026-01-01T00:00:00.000Z"),
    to: fc.constant("2026-01-02T00:00:00.000Z"),
  }),
  entry_count: fc.nat(1_000),
  first_hash: fc.option(fc.string({ minLength: 1, maxLength: 96 }), { nil: null }),
  last_hash: fc.option(fc.string({ minLength: 1, maxLength: 96 }), { nil: null }),
  hash_algorithm: fc.constant(AUDIT_EXPORT_HASH_ALGORITHM),
  hmac_key_version: fc.integer({ min: 1, max: 100 }),
  signing_key_version: fc.integer({ min: 1, max: 100 }),
  hmac: fc.string({ minLength: 1, maxLength: 96 }),
  signature: fc.string({ maxLength: 96 }),
  signature_algorithm: fc.constant(AUDIT_EXPORT_SIGNATURE_ALGORITHM),
  custody_evidence_refs: fc.record({
    hmac: fc.option(fc.string({ maxLength: 96 }), { nil: null }),
    signing: fc.option(fc.string({ maxLength: 96 }), { nil: null }),
  }),
});

function containsForbiddenEnvelopeKey(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = containsForbiddenEnvelopeKey(item);
      if (nested !== null) {
        return nested;
      }
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if ((FORBIDDEN_ENVELOPE_KEYS as readonly string[]).includes(key)) {
      return key;
    }
    const nested = containsForbiddenEnvelopeKey(child);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

describe("audit export safety fuzz", () => {
  it("finds forbidden sensitive-value keys anywhere in export-shaped JSON", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(scanAuditExportForForbiddenSensitiveValues(value)).toBe(
          containsForbiddenEnvelopeKey(value),
        );
      }),
    );
  });

  it("detects generated forbidden keys inside nested payloads", () => {
    fc.assert(
      fc.property(forbiddenKeyArb, fc.jsonValue(), (key, value) => {
        expect(scanAuditExportForForbiddenSensitiveValues({ safe: [{ [key]: value }] })).toBe(key);
      }),
    );
  });

  it("accepts generated valid manifest structure and fails closed after literal tampering", () => {
    fc.assert(
      fc.property(validManifestArb, (manifest) => {
        expect(validateAuditExportManifest(manifest)).toEqual({ ok: true, manifest });
        expect(validateAuditExportManifest({ ...manifest, hash_algorithm: "SHA1" }).ok).toBe(false);
      }),
    );
  });
});
