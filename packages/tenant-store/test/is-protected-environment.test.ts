import { environmentId, organizationId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantEnvironmentLifecycleStore } from "../src/environments/tenant-environment-lifecycle-store.js";

vi.mock("../src/with-tenant-scope.js", () => ({
  withTenantScope: vi.fn(),
}));

import { withTenantScope } from "../src/with-tenant-scope.js";
import { isProtectedEnvironment } from "../src/environments/is-protected-environment.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("isProtectedEnvironment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} } as never),
    );
  });

  it("returns false when the environment is missing", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue(null);

    await expect(isProtectedEnvironment(ORG, ENV)).resolves.toBe(false);
  });

  it("returns true when isProtected is set", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue({
      isProtected: true,
    } as never);

    await expect(isProtectedEnvironment(ORG, ENV)).resolves.toBe(true);
  });
});
