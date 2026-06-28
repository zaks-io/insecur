import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  exportTenantAuditEvents,
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportSigningKeyProvider,
  StaticAuditExportVerificationKeys,
  verifyAuditExport,
  writeAuditEvent,
} from "../src/index.js";
import { assertAuditExportJsonlIsMetadataOnly } from "./support/assert-audit-export-jsonl-metadata-only.js";
import {
  brandOpaqueResourceIdForPrefix,
  environmentId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("exportTenantAuditEvents", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("exports tenant-qualified events with a verifiable manifest", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const request = requestId.brand("req_00000000000000000000000088");

    await writeAuditEvent({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
      organizationId: org,
      projectId: projectId.brand(TEST_PROJECT_A_ID),
      environmentId: environmentId.brand(TEST_ENV_A_ID),
      resource: {
        type: "organization",
        id: brandOpaqueResourceIdForPrefix("org", TEST_ORG_A_ID),
      },
      request: { requestId: request },
    });

    const hmacKey = await StaticAuditExportHmacKeyProvider.create({
      keyVersion: 1,
      secret: new TextEncoder().encode("integration-audit-export-hmac"),
      custodyEvidenceRef: "escrow-record://instance/integration/audit-hmac/v1",
    });
    const signingKey = await StaticAuditExportSigningKeyProvider.generate({
      keyVersion: 1,
      custodyEvidenceRef: "escrow-record://instance/integration/audit-signing/v1",
    });

    const bundle = await exportTenantAuditEvents({
      organizationId: org,
      timeRange: {
        from: "2020-01-01T00:00:00.000Z",
        to: "2099-01-01T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    expect(bundle.manifest.organization_id).toBe(TEST_ORG_A_ID);
    expect(bundle.manifest.entry_count).toBeGreaterThan(0);
    expect(bundle.jsonl).toContain(TEST_ORG_A_ID);
    // Wide time range may include First Value smoke rows (e.g. secret.non_protected_write).
    assertAuditExportJsonlIsMetadataOnly(bundle.jsonl);
    expect(bundle.jsonl).toContain(FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned);

    const keys = new StaticAuditExportVerificationKeys();
    keys.registerHmacKey(hmacKey);
    keys.registerSigningKey(signingKey);

    const verification = await verifyAuditExport({
      jsonl: bundle.jsonl,
      manifest: bundle.manifest,
      expectedOrganizationId: org,
      keys,
    });

    expect(verification.status).toBe("valid");
  });
});
