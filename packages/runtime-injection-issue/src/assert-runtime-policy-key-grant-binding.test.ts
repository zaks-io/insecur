import { AUTHORIZATION_SCOPES } from "@insecur/access";
import {
  INJECTION_ERROR_CODES,
  environmentId,
  machineIdentityId,
  organizationId,
  parseVariableKey,
  projectId,
  runtimePolicyId,
  runtimePolicyVersionId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertRuntimePolicyKeyAllowsGrantSelector } from "./assert-runtime-policy-key-grant-binding.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const PROJECT_B = projectId.brand("prj_00000000000000000000000002");
const ENV_A = environmentId.brand("env_00000000000000000000000001");
const ENV_B = environmentId.brand("env_00000000000000000000000002");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const POLICY_VERSION = runtimePolicyVersionId.brand("rpv_00000000000000000000000001");
const SHARED_VARIABLE_KEY = (() => {
  const parsed = parseVariableKey("SHARED_KEY");
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

const getPolicyById = vi.fn();
const getVersionById = vi.fn();

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantRuntimeInjectionPolicyStore {
    getPolicyById = getPolicyById;
    getVersionById = getVersionById;
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
    projectId: PROJECT_B,
    environmentId: ENV_B,
    runtimePolicyKeyId: POLICY_KEY,
  },
  credentialScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue],
};

function policyRowForCoordinate(project: typeof PROJECT_A, environment: typeof ENV_A) {
  return {
    policyId: POLICY_KEY,
    organizationId: ORG,
    projectId: project,
    environmentId: environment,
    displayName: "deploy-policy" as never,
    activeVersionId: POLICY_VERSION,
    disabledAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  getPolicyById.mockReset();
  getVersionById.mockReset();
  getPolicyById.mockResolvedValue(policyRowForCoordinate(PROJECT_B, ENV_B));
  getVersionById.mockResolvedValue({
    variableKeys: [SHARED_VARIABLE_KEY],
    secretIds: [],
  });
});

describe("assertRuntimePolicyKeyAllowsGrantSelector", () => {
  it("allows selectors bound to the active runtime policy version at the grant coordinate", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT_B, environmentId: ENV_B },
        { kind: "variable_key", variableKey: SHARED_VARIABLE_KEY },
      ),
    ).resolves.toBeUndefined();
  });

  it("denies selectors outside the bound runtime policy key", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT_B, environmentId: ENV_B },
        { kind: "variable_key", variableKey: DISALLOWED_VARIABLE_KEY },
      ),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });
  });

  it("denies grants when the bound policy key belongs to a different project and environment", async () => {
    getPolicyById.mockResolvedValue(policyRowForCoordinate(PROJECT_A, ENV_A));

    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT_B, environmentId: ENV_B },
        { kind: "variable_key", variableKey: SHARED_VARIABLE_KEY },
      ),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    expect(getVersionById).not.toHaveBeenCalled();
  });

  it("allows policy_id selectors that match the bound runtime policy key", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT_B, environmentId: ENV_B },
        { kind: "policy_id", policyId: POLICY_KEY },
      ),
    ).resolves.toBeUndefined();
  });

  it("denies policy_id selectors outside the bound runtime policy key", async () => {
    await expect(
      assertRuntimePolicyKeyAllowsGrantSelector(
        machineActor,
        { organizationId: ORG, projectId: PROJECT_B, environmentId: ENV_B },
        {
          kind: "policy_id",
          policyId: runtimePolicyId.brand("rp_00000000000000000000000002"),
        },
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
            projectId: PROJECT_B,
            environmentId: ENV_B,
          },
        },
        { organizationId: ORG, projectId: PROJECT_B, environmentId: ENV_B },
        { kind: "variable_key", variableKey: DISALLOWED_VARIABLE_KEY },
      ),
    ).resolves.toBeUndefined();

    expect(getPolicyById).not.toHaveBeenCalled();
    expect(getVersionById).not.toHaveBeenCalled();
  });
});
