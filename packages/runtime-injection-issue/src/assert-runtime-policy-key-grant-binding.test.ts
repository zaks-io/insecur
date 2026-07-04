import { AUTHORIZATION_SCOPES } from "@insecur/access";
import {
  INJECTION_ERROR_CODES,
  environmentId,
  machineIdentityId,
  organizationId,
  parseVariableKey,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertRuntimePolicyKeyAllowsGrantSelector } from "./assert-runtime-policy-key-grant-binding.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const ALLOWED_VARIABLE_KEY = (() => {
  const parsed = parseVariableKey("ALLOWED_KEY");
  if (!parsed.ok) {
    throw new Error("test variable key fixture must be valid");
  }
  return parsed.value;
})();
const DISALLOWED_VARIABLE_KEY = (() => {
  const parsed = parseVariableKey("DISALLOWED_KEY");
  if (!parsed.ok) {
    throw new Error("test variable key fixture must be valid");
  }
  return parsed.value;
})();

const getActiveVersion = vi.fn();

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantRuntimeInjectionPolicyStore {
    getActiveVersion = getActiveVersion;
  }
  return {
    ...actual,
    withTenantScope: vi.fn(
      async (_scope: unknown, fn: (ctx: { db: unknown }) => Promise<unknown>) =>
        await fn({ db: {} }),
    ),
    TenantRuntimeInjectionPolicyStore: MockTenantRuntimeInjectionPolicyStore,
  };
});

const machineActor = {
  type: "machine" as const,
  machineIdentityId: MACHINE,
  tokenScope: {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    runtimePolicyKeyId: POLICY_KEY,
  },
  credentialScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue],
};

beforeEach(() => {
  getActiveVersion.mockReset();
  getActiveVersion.mockResolvedValue({
    variableKeys: [ALLOWED_VARIABLE_KEY],
    secretIds: [],
  });
});

describe("assertRuntimePolicyKeyAllowsGrantSelector", () => {
  it("allows selectors bound to the active runtime policy version", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        { kind: "variable_key", variableKey: ALLOWED_VARIABLE_KEY },
      ),
    ).resolves.toBeUndefined();
  });

  it("denies selectors outside the bound runtime policy key", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        { kind: "variable_key", variableKey: DISALLOWED_VARIABLE_KEY },
      ),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });

  it("skips enforcement for machine actors without a bound runtime policy key", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        {
          ...machineActor,
          tokenScope: {
            organizationId: ORG,
            projectId: PROJECT,
            environmentId: ENV,
          },
        },
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        { kind: "variable_key", variableKey: DISALLOWED_VARIABLE_KEY },
      ),
    ).resolves.toBeUndefined();

    expect(getActiveVersion).not.toHaveBeenCalled();
  });
});
