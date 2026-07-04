import { providerAppRegistrationId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { TenantProviderAppRegistrationStore } from "../../src/provider-app-registrations/tenant-provider-app-registration-store.js";
import type { TenantScopedDb } from "../../src/tenant-scoped-db.js";

const INSTANCE_ID = "inst_00000000000000000000000001";
const REGISTRATION_ID = providerAppRegistrationId.brand("preg_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const NOW = new Date("2026-07-01T00:00:00.000Z");

const CONFIGURED_ROW = {
  id: REGISTRATION_ID,
  instance_id: INSTANCE_ID,
  provider: "github",
  connection_method: "github-app",
  client_id: "github-client-id",
  callback_path: "/oauth/github/callback",
  status: "configured",
  created_at: NOW,
  updated_at: NOW,
};

function createUpsertCapturingDb(): {
  db: TenantScopedDb;
  conflictUpdates: Record<string, unknown>[];
} {
  const conflictUpdates: Record<string, unknown>[] = [];
  const values = vi.fn(() => ({
    onConflictDoUpdate: vi.fn(({ set }: { set: Record<string, unknown> }) => {
      conflictUpdates.push(set);
      return Promise.resolve(undefined);
    }),
  }));
  const selectWhere = vi.fn(() => ({
    limit: vi.fn(async () => [CONFIGURED_ROW]),
  }));

  const db = {
    insert: vi.fn(() => ({ values })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: selectWhere })),
    })),
  } as unknown as TenantScopedDb;

  return { db, conflictUpdates };
}

describe("TenantProviderAppRegistrationStore.upsertRegistration", () => {
  it("preserves configured status when metadata upserts omit status", async () => {
    const { db, conflictUpdates } = createUpsertCapturingDb();
    const store = new TenantProviderAppRegistrationStore(db);

    const registration = await store.upsertRegistration({
      instanceId: INSTANCE_ID,
      registrationId: REGISTRATION_ID,
      provider: "github",
      connectionMethod: "github-app",
      clientId: "github-client-id-updated",
      callbackPath: "/oauth/github/callback-v2",
    });

    expect(conflictUpdates[0]).toEqual({
      clientId: "github-client-id-updated",
      callbackPath: "/oauth/github/callback-v2",
      updatedAt: expect.any(Date),
    });
    expect(conflictUpdates[0]).not.toHaveProperty("status");
    expect(registration.status).toBe("configured");
  });

  it("updates status when explicitly provided", async () => {
    const { db, conflictUpdates } = createUpsertCapturingDb();
    const store = new TenantProviderAppRegistrationStore(db);

    await store.upsertRegistration({
      instanceId: INSTANCE_ID,
      registrationId: REGISTRATION_ID,
      provider: "github",
      connectionMethod: "github-app",
      clientId: "github-client-id",
      callbackPath: "/oauth/github/callback",
      status: "pending_setup",
    });

    expect(conflictUpdates[0]?.status).toBe("pending_setup");
  });
});
