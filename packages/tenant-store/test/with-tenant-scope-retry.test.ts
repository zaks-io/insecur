import { describe, expect, it, vi } from "vitest";

import { withTenantScope } from "../src/with-tenant-scope.js";
import type { TenantScope } from "../src/tenant-scope.js";

// Pins that withTenantScope actually wraps sql.begin in the acquisition-failure retry (INS-603):
// a refactor that drops retryOnceOnConnectionAcquisitionFailure must fail this test.
const begin = vi.fn();
vi.mock("../src/db/connection.js", () => ({
  getRuntimeSql: () => ({ begin }),
}));

const SCOPE = { kind: "organization", organizationId: "org_test" } as TenantScope;

describe("withTenantScope acquisition retry wiring", () => {
  it("retries sql.begin once after a Hyperdrive pool-wait 58000 and returns the retry result", async () => {
    begin.mockReset();
    begin
      .mockRejectedValueOnce(
        Object.assign(new Error("Timed out while waiting for an open slot in the pool."), {
          code: "58000",
        }),
      )
      .mockResolvedValueOnce("recovered");

    await expect(withTenantScope(SCOPE, async () => "unused")).resolves.toBe("recovered");
    expect(begin).toHaveBeenCalledTimes(2);
  });

  it("does not retry sql.begin for non-acquisition failures", async () => {
    begin.mockReset();
    begin.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));

    await expect(withTenantScope(SCOPE, async () => "unused")).rejects.toMatchObject({
      code: "23505",
    });
    expect(begin).toHaveBeenCalledTimes(1);
  });
});
