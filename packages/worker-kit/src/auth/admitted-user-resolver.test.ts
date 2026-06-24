import { userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import {
  createAdmittedUserResolver,
  createStoreAdmittedUserResolver,
  resolveInstanceId,
} from "./admitted-user-resolver.js";
import { testSessionSigningSecret } from "@insecur/auth";

vi.mock("@insecur/tenant-store", () => ({
  resolveAdmittedUserId: vi.fn(),
}));

import { resolveAdmittedUserId } from "@insecur/tenant-store";

const mockedResolveAdmittedUserId = vi.mocked(resolveAdmittedUserId);

const baseEnv: AuthWorkerEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
};

describe("resolveInstanceId", () => {
  it("uses INSTANCE_ID when set", () => {
    expect(resolveInstanceId({ ...baseEnv, INSTANCE_ID: "inst_PREVIEW" })).toBe("inst_PREVIEW");
  });

  it("falls back to inst_LOCAL_DEV when INSTANCE_ID is absent", () => {
    expect(resolveInstanceId(baseEnv)).toBe("inst_LOCAL_DEV");
  });
});

describe("createStoreAdmittedUserResolver", () => {
  it("delegates to resolveAdmittedUserId with the bound instance id", async () => {
    const admitted = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    mockedResolveAdmittedUserId.mockResolvedValueOnce(admitted);

    const resolve = createStoreAdmittedUserResolver("inst_TEST");
    await expect(resolve("user_workos")).resolves.toBe(admitted);
    expect(mockedResolveAdmittedUserId).toHaveBeenCalledWith("inst_TEST", "user_workos");
  });
});

describe("createAdmittedUserResolver", () => {
  it("binds the env instance id", async () => {
    mockedResolveAdmittedUserId.mockResolvedValueOnce(null);

    const resolve = createAdmittedUserResolver({ ...baseEnv, INSTANCE_ID: "inst_ENV" });
    await expect(resolve("user_unknown")).resolves.toBeNull();
    expect(mockedResolveAdmittedUserId).toHaveBeenCalledWith("inst_ENV", "user_unknown");
  });
});
