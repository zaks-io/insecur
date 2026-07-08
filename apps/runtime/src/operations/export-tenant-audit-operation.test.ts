import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { exportTenantAuditEvents } from "@insecur/audit";
import { organizationId, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAuditExportKeyProviders } from "../../../../packages/audit/test/support/test-audit-export-keys.js";
import {
  exportTenantAuditOperation,
  type ExportTenantAuditOperationInput,
} from "./export-tenant-audit-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    exportTenantAuditEvents: vi.fn(actual.exportTenantAuditEvents),
  };
});

vi.mock("../crypto/audit-export-key-providers.js", () => ({
  resolveAuditExportKeyProviders: vi.fn(),
}));

import { authorizeScopeOrThrow } from "@insecur/access";
import { resolveAuditExportKeyProviders } from "../crypto/audit-export-key-providers.js";
import type { RuntimeEnv } from "../env.js";

const ORG = organizationId.brand("org_00000000000000000000000011");
const auditActor: ExportTenantAuditOperationInput["auditActor"] = {
  type: "user",
  userId: userId.brand("usr_00000000000000000000000011"),
};
const accessActor: ExportTenantAuditOperationInput["accessActor"] = {
  type: "user",
  userId: auditActor.userId,
};

describe("exportTenantAuditOperation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    const keys = await createTestAuditExportKeyProviders();
    vi.mocked(resolveAuditExportKeyProviders).mockResolvedValue({
      hmacKey: keys.hmacKey,
      signingKey: keys.signingKey,
    });
  });

  it("authorizes metadata detail read before exporting", async () => {
    vi.mocked(exportTenantAuditEvents).mockResolvedValue({
      jsonl: "",
      manifest: {
        schema_version: "1",
        organization_id: ORG,
        time_range: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-02T00:00:00.000Z",
        },
        entry_count: 0,
        first_hash: null,
        last_hash: null,
        hash_algorithm: "SHA-256",
        hmac_key_version: 1,
        signing_key_version: 1,
        hmac: "hmac",
        signature: "signature",
        signature_algorithm: "Ed25519",
        custody_evidence_refs: { hmac: null, signing: null },
      },
    });

    await exportTenantAuditOperation({
      env: {
        RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
      } as RuntimeEnv,
      input: {
        organizationId: ORG,
        requestId: requestId.brand("req_00000000000000000000000011"),
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-02T00:00:00.000Z",
        actorToken: "token",
      },
      auditActor,
      accessActor,
    });

    expect(authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredScope: AUTHORIZATION_SCOPES.metadataDetailRead,
        coordinate: { organizationId: ORG },
      }),
    );
    expect(resolveAuditExportKeyProviders).toHaveBeenCalled();
    expect(exportTenantAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        timeRange: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-02T00:00:00.000Z",
        },
      }),
    );
  });
});
