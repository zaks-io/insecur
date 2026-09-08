import { describe, expect, it, vi } from "vitest";

import { ensureRecoveryCanaryOrganization } from "../src/ensure-recovery-canary-organization.js";
import type { TenantScopedSql } from "../src/tenant-scoped-sql.js";

describe("ensureRecoveryCanaryOrganization", () => {
  it("provisions the standing organization using its fixed identity", async () => {
    const sql = vi.fn().mockResolvedValue([]);

    await ensureRecoveryCanaryOrganization(sql as unknown as TenantScopedSql, "inst_1");

    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0]?.slice(1)).toEqual([
      "org_01RCAN00000000000000000001",
      "inst_1",
      "Recovery Canary",
    ]);
  });

  it("propagates provisioning failures", async () => {
    const sql = vi.fn().mockRejectedValue(new Error("instance foreign key violation"));
    await expect(
      ensureRecoveryCanaryOrganization(sql as unknown as TenantScopedSql, "inst_missing"),
    ).rejects.toThrow("instance foreign key violation");
  });
});
