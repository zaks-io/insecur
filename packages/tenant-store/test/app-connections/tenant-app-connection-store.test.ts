import { appConnectionId, organizationId, providerCredentialId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { TenantAppConnectionStore } from "../../src/app-connections/tenant-app-connection-store.js";
import { createMockTenantDb } from "../helpers/mock-tenant-db.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-01T00:00:00.000Z");

const ACTIVE_ROW = {
  id: CONN,
  org_id: ORG,
  provider: "cloudflare",
  connection_method: "scoped-api-token",
  display_name: "Cloudflare workers",
  status: "active",
  setup_user_id: SETUP_USER,
  active_credential_id: CRED,
  status_reason_code: null,
  last_validation_checked_at: NOW,
  last_validation_outcome: "success",
  last_validation_reason_code: null,
  created_at: NOW,
  updated_at: NOW,
};

describe("TenantAppConnectionStore.updateConnectionStatus", () => {
  it("preserves active_credential_id when status-only updates omit it", async () => {
    const { db, updateSets } = createMockTenantDb({
      updateReturning: [
        [{ ...ACTIVE_ROW, status: "disconnected", status_reason_code: "connection.disconnected" }],
      ],
    });
    const store = new TenantAppConnectionStore(db);

    const updated = await store.updateConnectionStatus({
      organizationId: ORG,
      appConnectionId: CONN,
      status: "disconnected",
      statusReasonCode: "connection.disconnected",
    });

    expect(updateSets[0]).toEqual({
      status: "disconnected",
      statusReasonCode: "connection.disconnected",
      updatedAt: expect.any(Date),
    });
    expect(updateSets[0]).not.toHaveProperty("activeCredentialId");
    expect(updated.activeCredentialId).toBe(CRED);
    expect(updated.lastValidationCheckedAt).toEqual(NOW);
    expect(updated.lastValidationOutcome).toBe("success");
    expect(updated.lastValidationReasonCode).toBeNull();
  });

  it("clears active_credential_id only when explicitly set to null", async () => {
    const { db, updateSets } = createMockTenantDb({
      updateReturning: [[{ ...ACTIVE_ROW, active_credential_id: null }]],
    });
    const store = new TenantAppConnectionStore(db);

    await store.updateConnectionStatus({
      organizationId: ORG,
      appConnectionId: CONN,
      status: "reauthorization_required",
      activeCredentialId: null,
    });

    expect(updateSets[0]?.activeCredentialId).toBeNull();
  });
});
