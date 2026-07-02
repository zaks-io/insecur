import {
  environmentId,
  machineIdentityId,
  organizationId,
  projectId,
  RUNTIME_POLICY_ERROR_CODES,
  userId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertProtectedPolicyUseAllowed } from "../src/assert-protected-policy-use.js";
import { RuntimeInjectionPolicyError } from "../src/runtime-injection-policy-error.js";

const COORDINATE = {
  organizationId: organizationId.brand("org_00000000000000000000000001"),
  projectId: projectId.brand("prj_00000000000000000000000001"),
  environmentId: environmentId.brand("env_00000000000000000000000001"),
};

describe("assertProtectedPolicyUseAllowed", () => {
  it("allows non-protected policy use for human actors", async () => {
    await expect(
      assertProtectedPolicyUseAllowed({
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        coordinate: COORDINATE,
        isProtected: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("blocks protected policy use for human sessions", async () => {
    await expect(
      assertProtectedPolicyUseAllowed({
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        coordinate: COORDINATE,
        isProtected: true,
      }),
    ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked });
  });

  it("blocks protected policy use until storage security gate passes", async () => {
    await expect(
      assertProtectedPolicyUseAllowed({
        actor: {
          type: "machine",
          machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
        },
        coordinate: COORDINATE,
        isProtected: true,
        storageSecurityGatePassed: false,
      }),
    ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked });
  });

  it("throws RuntimeInjectionPolicyError for protected human use", async () => {
    await expect(
      assertProtectedPolicyUseAllowed({
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        coordinate: COORDINATE,
        isProtected: true,
      }),
    ).rejects.toBeInstanceOf(RuntimeInjectionPolicyError);
  });
});
