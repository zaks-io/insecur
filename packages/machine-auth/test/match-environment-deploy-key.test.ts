import { CREDENTIAL_SCOPES } from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEPLOY_KEY_SECRET_ALGORITHM } from "../src/deploy-key-secret.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "../src/environment-deploy-key-auth-method-row.js";
import { matchEnvironmentDeployKey } from "../src/match-environment-deploy-key.js";
import { createDeployKeyTestSecret } from "./helpers/deploy-key-test-secret.js";

const deployKeySecretHolder = { value: "" };

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const OTHER_ENV = environmentId.brand("env_00000000000000000000000002");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const OTHER_MACHINE = machineIdentityId.brand("mach_00000000000000000000000002");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000004");
const OTHER_AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000005");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const NOW = 1_700_000_000;

const SHARED_VERIFIER = {
  algorithm: DEPLOY_KEY_SECRET_ALGORITHM,
  saltB64: "c2FsdA",
  hashB64: "aGFzaA",
};

function authMethodRow(
  overrides: Partial<EnvironmentDeployKeyAuthMethodRow> = {},
): EnvironmentDeployKeyAuthMethodRow {
  return {
    id: AUTH_METHOD,
    organizationId: ORG,
    machineIdentityId: MACHINE,
    projectId: PROJECT,
    environmentId: ENV,
    runtimePolicyKeyIds: [POLICY_KEY],
    credentialScopes: [
      CREDENTIAL_SCOPES.runtimeInjectionRun,
      CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
    ],
    secretVerifier: SHARED_VERIFIER,
    status: "active",
    expiresAt: new Date((NOW + 86_400) * 1000),
    nonExpiring: false,
    rotationIntervalSeconds: null,
    rotationReminderIntervalSeconds: null,
    createdAt: new Date((NOW - 10_000) * 1000),
    ...overrides,
  };
}

vi.mock("../src/deploy-key-secret.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/deploy-key-secret.js")>();
  return {
    ...actual,
    verifyDeployKeySecret: vi.fn((secret: string) => secret === deployKeySecretHolder.value),
  };
});

describe("matchEnvironmentDeployKey", () => {
  beforeAll(() => {
    deployKeySecretHolder.value = createDeployKeyTestSecret();
  });

  it("prefers wrong-environment over disabled when the secret matches another environment", () => {
    const result = matchEnvironmentDeployKey({
      deployKeySecret: deployKeySecretHolder.value,
      projectId: PROJECT,
      environmentId: OTHER_ENV,
      authMethods: [authMethodRow({ status: "disabled" })],
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_environment");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.deployKeyWrongEnvironment);
    }
  });

  it("continues past wrong-environment rows that share verifier material", () => {
    const result = matchEnvironmentDeployKey({
      deployKeySecret: deployKeySecretHolder.value,
      projectId: PROJECT,
      environmentId: ENV,
      authMethods: [
        authMethodRow({
          id: OTHER_AUTH_METHOD,
          machineIdentityId: OTHER_MACHINE,
          environmentId: OTHER_ENV,
          status: "disabled",
        }),
        authMethodRow(),
      ],
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: true,
      authMethod: authMethodRow(),
    });
  });

  it("denies disabled keys only after the requested environment matches", () => {
    const result = matchEnvironmentDeployKey({
      deployKeySecret: deployKeySecretHolder.value,
      projectId: PROJECT,
      environmentId: ENV,
      authMethods: [authMethodRow({ status: "disabled" })],
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      reason: "disabled",
      reasonCode: AUTH_ERROR_CODES.deployKeyDisabled,
      authMethod: authMethodRow({ status: "disabled" }),
    });
  });
});
