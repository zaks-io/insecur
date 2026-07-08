import { environmentId, organizationId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getById } = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  TenantEnvironmentLifecycleStore: vi.fn(function MockStore(this: { getById: typeof getById }) {
    this.getById = getById;
  }),
  withTenantScope: vi.fn(async (_scope, callback) => callback({ db: {} })),
}));

import { assertProtectedEnvironment } from "../src/assert-protected-environment.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("assertProtectedEnvironment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing environments", async () => {
    getById.mockResolvedValue(null);

    await expect(assertProtectedEnvironment(ORG, ENV)).rejects.toMatchObject({
      code: "environment.not_found",
    });
  });

  it("rejects non-protected environments", async () => {
    getById.mockResolvedValue({ isProtected: false });

    await expect(assertProtectedEnvironment(ORG, ENV)).rejects.toMatchObject({
      code: "environment.non_protected_environment",
    });
  });
});
