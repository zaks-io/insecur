import { appConnectionId, organizationId, providerCredentialId, userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { attachProviderCredential } from "../src/attach-provider-credential.js";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-01T00:00:00.000Z");

const PENDING_CONNECTION: AppConnectionRow = {
  id: CONN,
  organizationId: ORG,
  provider: "cloudflare",
  connectionMethod: "scoped-api-token",
  displayName: "Cloudflare workers",
  status: "pending_setup",
  setupUserId: SETUP_USER,
  activeCredentialId: null,
  statusReasonCode: null,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("attachProviderCredential", () => {
  it("delegates credential attach and activation to the app connection store", async () => {
    const activated: AppConnectionRow = {
      ...PENDING_CONNECTION,
      status: "active",
      activeCredentialId: CRED,
    };
    const attachActiveProviderCredential = vi.fn(async () => activated);
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
    } as unknown as TenantAppConnectionStore;

    const wrapped = {
      organizationDataKeyVersion: 1,
      ciphertext: new Uint8Array([1, 2, 3]),
    };

    const result = await attachProviderCredential({
      organizationId: ORG,
      appConnectionId: CONN,
      credentialId: CRED,
      wrapped,
      appConnectionStore,
    });

    expect(attachActiveProviderCredential).toHaveBeenCalledWith({
      organizationId: ORG,
      appConnectionId: CONN,
      credentialId: CRED,
      connectionMethod: "scoped-api-token",
      wrapped,
    });
    expect(result).toBe(activated);
  });
});
