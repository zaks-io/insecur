import { organizationId } from "@insecur/domain";
import { describe, expect, it, beforeAll } from "vitest";
import {
  AUDIT_EXPORT_FAILURE_CODES,
  buildAuditExport,
  FIRST_VALUE_AUDIT_EVENT_CODES,
  parseAuditExportJsonl,
  parseAuditExportManifest,
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportSigningKeyProvider,
  StaticAuditExportVerificationKeys,
  verifyAuditExport,
  type AuditExportEventPayload,
  type AuditExportHmacKeyProvider,
  type AuditExportManifest,
  type AuditExportSigningKeyProvider,
} from "../src/index.js";
import { assertAuditExportJsonlIsMetadataOnly } from "./support/assert-audit-export-jsonl-metadata-only.js";

const ORG = organizationId.brand("org_00000000000000000000000001");

function sampleEvent(overrides: Partial<AuditExportEventPayload> = {}): AuditExportEventPayload {
  return {
    id: "aud_00000000000000000000000001",
    organization_id: ORG,
    event_code: "onboarding.guided_provisioned",
    outcome: "success",
    result_code: "audit.succeeded",
    actor_type: "user",
    actor_user_id: "usr_00000000000000000000000001",
    actor_machine_identity_id: null,
    project_id: "prj_00000000000000000000000001",
    environment_id: "env_00000000000000000000000001",
    resource_type: "organization",
    resource_id: ORG,
    related_resource_type: null,
    related_resource_id: null,
    request_id: "req_00000000000000000000000001",
    operation_id: null,
    details: { phase: "complete" },
    recorded_at: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("audit export and verify", () => {
  let hmacKey: AuditExportHmacKeyProvider;
  let signingKey: AuditExportSigningKeyProvider;
  let verificationKeys: StaticAuditExportVerificationKeys;

  beforeAll(async () => {
    hmacKey = await StaticAuditExportHmacKeyProvider.create({
      keyVersion: 1,
      secret: new TextEncoder().encode("audit-export-hmac-test-secret"),
      custodyEvidenceRef: "escrow-record://instance/test/audit-hmac/v1",
    });
    signingKey = await StaticAuditExportSigningKeyProvider.generate({
      keyVersion: 1,
      custodyEvidenceRef: "escrow-record://instance/test/audit-signing/v1",
    });
    verificationKeys = new StaticAuditExportVerificationKeys();
    verificationKeys.registerHmacKey(hmacKey);
    verificationKeys.registerSigningKey(signingKey);
  });

  it("builds and verifies a valid export", async () => {
    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [sampleEvent()],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    const result = await verifyAuditExport({
      jsonl: bundle.jsonl,
      manifest: bundle.manifest,
      expectedOrganizationId: ORG,
      keys: verificationKeys,
    });

    expect(result.status).toBe("valid");
    expect(result.entry_count).toBe(1);
    expect(result.integrity).toEqual({
      hash_chain: "valid",
      manifest_hmac: "valid",
      signature: "valid",
      tenant_scope: "valid",
    });
    assertAuditExportJsonlIsMetadataOnly(bundle.jsonl);
  });

  it("allows First Value secret metadata in exported jsonl", async () => {
    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [
        sampleEvent({
          event_code: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
          resource_type: "secret",
          resource_id: "sec_00000000000000000000000001",
        }),
      ],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    expect(bundle.jsonl).toContain(FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite);
    assertAuditExportJsonlIsMetadataOnly(bundle.jsonl);
  });

  it("rejects exported jsonl that contains forbidden sensitive value keys", () => {
    const tamperedJsonl = `${JSON.stringify({
      schema_version: "1",
      sequence: 0,
      event: sampleEvent({
        details: {
          password: "must-not-export",
        },
      }),
      chain: { previous_hash: null, entry_hash: "hash" },
    })}\n`;

    expect(() => assertAuditExportJsonlIsMetadataOnly(tamperedJsonl)).toThrow(
      /forbidden key: password/,
    );
  });

  it("detects tampered event payloads", async () => {
    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [sampleEvent()],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    const entries = parseAuditExportJsonl(bundle.jsonl);
    const tampered = entries[0];
    if (tampered === undefined) {
      throw new Error("expected one export entry");
    }
    const tamperedJsonl = `${JSON.stringify({
      ...tampered,
      event: { ...tampered.event, outcome: "denied" },
    })}\n`;

    const result = await verifyAuditExport({
      jsonl: tamperedJsonl,
      manifest: bundle.manifest,
      expectedOrganizationId: ORG,
      keys: verificationKeys,
    });

    expect(result.status).toBe("invalid");
    expect(result.failure_codes).toContain(AUDIT_EXPORT_FAILURE_CODES.entryTampered);
    expect(result.integrity.hash_chain).toBe("invalid");
  });

  it("detects broken hash chains", async () => {
    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [
        sampleEvent({ id: "aud_00000000000000000000000001" }),
        sampleEvent({
          id: "aud_00000000000000000000000002",
          recorded_at: "2026-05-01T12:01:00.000Z",
        }),
      ],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    const entries = parseAuditExportJsonl(bundle.jsonl);
    const second = entries[1];
    if (second === undefined) {
      throw new Error("expected two export entries");
    }
    const brokenJsonl = `${JSON.stringify(entries[0])}\n${JSON.stringify({
      ...second,
      chain: { ...second.chain, previous_hash: "broken" },
    })}\n`;

    const result = await verifyAuditExport({
      jsonl: brokenJsonl,
      manifest: bundle.manifest,
      keys: verificationKeys,
    });

    expect(result.status).toBe("invalid");
    expect(
      result.failure_codes.some((code) =>
        [AUDIT_EXPORT_FAILURE_CODES.chainBroken, AUDIT_EXPORT_FAILURE_CODES.entryTampered].includes(
          code,
        ),
      ),
    ).toBe(true);
  });

  it("detects invalid manifests", async () => {
    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [sampleEvent()],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    const result = await verifyAuditExport({
      jsonl: bundle.jsonl,
      manifest: { ...bundle.manifest, hmac: "invalid-hmac" },
      keys: verificationKeys,
    });

    expect(result.status).toBe("invalid");
    expect(result.failure_codes).toContain(AUDIT_EXPORT_FAILURE_CODES.manifestHmacInvalid);
    expect(result.integrity.manifest_hmac).toBe("invalid");
  });

  it("detects missing tenant scope and organization mismatches", async () => {
    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [sampleEvent()],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    const otherOrg = organizationId.brand("org_00000000000000000000000002");
    const mismatched = await verifyAuditExport({
      jsonl: bundle.jsonl,
      manifest: bundle.manifest,
      expectedOrganizationId: otherOrg,
      keys: verificationKeys,
    });
    expect(mismatched.status).toBe("invalid");
    expect(mismatched.failure_codes).toContain(AUDIT_EXPORT_FAILURE_CODES.tenantScopeMismatch);

    const empty = await verifyAuditExport({
      jsonl: "",
      manifest: {
        ...bundle.manifest,
        entry_count: 0,
        first_hash: null,
        last_hash: null,
      },
      keys: verificationKeys,
    });
    expect(empty.status).toBe("invalid");
    expect(empty.failure_codes).toContain(AUDIT_EXPORT_FAILURE_CODES.tenantScopeMissing);
  });

  it("rejects exports containing forbidden sensitive value keys", async () => {
    await expect(
      buildAuditExport({
        organizationId: ORG,
        events: [
          sampleEvent({
            details: {
              password: "must-not-export",
            },
          }),
        ],
        timeRange: {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-05-02T00:00:00.000Z",
        },
        hmacKey,
        signingKey,
      }),
    ).rejects.toThrow(/forbidden key: password/);
  });

  it("rejects malformed manifests during parse", () => {
    expect(() => parseAuditExportManifest(null)).toThrow(
      "audit export manifest must be a JSON object",
    );
    expect(() => parseAuditExportManifest({ schema_version: "99" })).toThrow(
      "unsupported audit export manifest schema version",
    );
    expect(() =>
      parseAuditExportManifest({
        schema_version: "1",
        organization_id: "not-an-org-id",
        time_range: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-02T00:00:00.000Z" },
        entry_count: 1,
        first_hash: "hash",
        last_hash: "hash",
        hash_algorithm: "SHA-256",
        hmac_key_version: 1,
        signing_key_version: 1,
        hmac: "hmac",
        signature: "signature",
        signature_algorithm: "Ed25519",
        custody_evidence_refs: { hmac: null, signing: null },
      }),
    ).toThrow("audit export manifest organization_id is missing or invalid");
    expect(() =>
      parseAuditExportManifest({
        schema_version: "1",
        organization_id: ORG,
        time_range: { from: "2026-05-01T00:00:00.000Z" },
        entry_count: 1,
        first_hash: "hash",
        last_hash: "hash",
        hash_algorithm: "SHA-256",
        hmac_key_version: 1,
        signing_key_version: 1,
        hmac: "hmac",
        signature: "signature",
        signature_algorithm: "Ed25519",
        custody_evidence_refs: { hmac: null, signing: null },
      }),
    ).toThrow("audit export manifest time_range is missing or invalid");
    expect(() =>
      parseAuditExportManifest({
        schema_version: "1",
        organization_id: ORG,
        time_range: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-02T00:00:00.000Z" },
        entry_count: "1",
        first_hash: "hash",
        last_hash: "hash",
        hash_algorithm: "SHA-256",
        hmac_key_version: 1,
        signing_key_version: 1,
        hmac: "hmac",
        signature: "signature",
        signature_algorithm: "Ed25519",
        custody_evidence_refs: { hmac: null, signing: null },
      }),
    ).toThrow("audit export manifest entry_count is missing or invalid");
    expect(() =>
      parseAuditExportManifest({
        schema_version: "1",
        organization_id: ORG,
        time_range: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-02T00:00:00.000Z" },
        entry_count: 1,
        first_hash: "hash",
        last_hash: "hash",
        hash_algorithm: "SHA-256",
        hmac_key_version: 0,
        signing_key_version: 1,
        hmac: "hmac",
        signature: "signature",
        signature_algorithm: "Ed25519",
        custody_evidence_refs: { hmac: null, signing: null },
      }),
    ).toThrow("audit export manifest hmac_key_version is missing or invalid");
    expect(() =>
      parseAuditExportManifest({
        schema_version: "1",
        organization_id: ORG,
        time_range: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-02T00:00:00.000Z" },
        entry_count: 1,
        first_hash: "hash",
        last_hash: "hash",
        hash_algorithm: "SHA-256",
        hmac_key_version: 1,
        signing_key_version: 1,
        hmac: "hmac",
        signature: "signature",
        signature_algorithm: "Ed25519",
      }),
    ).toThrow("audit export manifest custody_evidence_refs is missing or invalid");
  });

  it("returns stable invalid evidence for malformed verification manifests", async () => {
    const malformedManifest = {
      schema_version: "1",
      organization_id: ORG,
      time_range: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-02T00:00:00.000Z" },
      entry_count: 1,
      first_hash: "hash",
      last_hash: "hash",
      hash_algorithm: "SHA-256",
      hmac_key_version: 1,
      signing_key_version: 1,
      hmac: "hmac",
      signature: "signature",
      signature_algorithm: "Ed25519",
    } as unknown as AuditExportManifest;

    const result = await verifyAuditExport({
      jsonl: "",
      manifest: malformedManifest,
      keys: verificationKeys,
    });

    expect(result.status).toBe("invalid");
    expect(result.failure_codes).toEqual([AUDIT_EXPORT_FAILURE_CODES.manifestInvalid]);
    expect(result.integrity).toEqual({
      hash_chain: "missing",
      manifest_hmac: "missing",
      signature: "missing",
      tenant_scope: "missing",
    });
    expect(result.organization_id).toBe(ORG);
    expect(result.entry_count).toBe(1);
    expect(result.custody_evidence_refs).toBeNull();
  });
});
