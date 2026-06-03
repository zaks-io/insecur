import { describe, expect, it, vi } from "vitest";

import { organizationId } from "@insecur/domain";
import { applyTenantScope } from "../src/apply-tenant-scope.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";

describe("applyTenantScope", () => {
  it("sets organization scope via transaction-local set_config", async () => {
    const execute = vi.fn(async () => undefined);
    const db = { execute } as unknown as TenantScopedDb;
    const org = organizationId.brand("org_00000000000000000000000001");

    await applyTenantScope(db, { kind: "organization", organizationId: org });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("sets service scope via transaction-local set_config", async () => {
    const execute = vi.fn(async () => undefined);
    const db = { execute } as unknown as TenantScopedDb;

    await applyTenantScope(db, { kind: "service" });

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
