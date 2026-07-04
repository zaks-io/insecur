import { CREDENTIAL_SCOPES } from "@insecur/access";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeTenantSql } from "../../operations/test/helpers/fake-tenant-sql.js";
import { DEPLOY_KEY_SECRET_ALGORITHM } from "../src/deploy-key-secret.js";
import { exchangeEnvironmentDeployKey } from "../src/exchange-environment-deploy-key.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "../src/environment-deploy-key-auth-method-row.js";
import { loadActiveEnvironmentDeployKeyAuthMethods } from "../src/load-environment-deploy-key-auth-methods.js";
import { mintMachineAccessToken } from "../src/machine-access-token.js";
import { matchEnvironmentDeployKey } from "../src/match-environment-deploy-key.js";

vi.mock("@insecur/audit", () => ({
  PRODUCTION_AUDIT_EVENT_CODES: {
    machineDeployKeyExchanged: "machine_auth.deploy_key_exchanged",
    machineDeployKeyExchangeDenied: "machine_auth.deploy_key_exchange_denied",
  },
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../src/load-environment-deploy-key-auth-methods.js", () => ({
  loadActiveEnvironmentDeployKeyAuthMethods: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/match-environment-deploy-key.js", () => ({
  matchEnvironmentDeployKey: vi.fn(),
}));

vi.mock("../src/machine-access-token.js", () => ({
  mintMachineAccessToken: vi.fn(),
}));

import { writeAuditEvent } from "@insecur/audit";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000004");
const ALLOWED_POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const DISALLOWED_POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000002");
const SIGNING_SECRET = "unit-machine-access-signing-secret";
const DEPLOY_KEY_SECRET = "unit-deploy-key-secret";
const NOW = 1_700_000_000;

function matchedAuthMethod(): EnvironmentDeployKeyAuthMethodRow {
  return {
    id: AUTH_METHOD,
    organizationId: ORG,
    machineIdentityId: MACHINE,
    projectId: PROJECT,
    environmentId: ENV,
    runtimePolicyKeyIds: [ALLOWED_POLICY_KEY],
    credentialScopes: [
      CREDENTIAL_SCOPES.runtimeInjectionRun,
      CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
    ],
    secretVerifier: {
      algorithm: DEPLOY_KEY_SECRET_ALGORITHM,
      saltB64: "c2FsdA",
      hashB64: "aGFzaA",
    },
    status: "active",
    expiresAt: new Date((NOW + 86_400) * 1000),
    nonExpiring: false,
    rotationIntervalSeconds: null,
    rotationReminderIntervalSeconds: null,
    createdAt: new Date((NOW - 10_000) * 1000),
  };
}

describe("exchangeEnvironmentDeployKey runtime policy allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(matchEnvironmentDeployKey).mockReturnValue({
      ok: true,
      authMethod: matchedAuthMethod(),
    });
  });

  it("denies when runtimePolicyKeyId is outside the deploy key allowlist", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: createFakeTenantSql(() => []),
      runtimePolicyKeyId: DISALLOWED_POLICY_KEY,
      nowEpoch: NOW,
    });

    expect(loadActiveEnvironmentDeployKeyAuthMethods).toHaveBeenCalled();
    expect(matchEnvironmentDeployKey).toHaveBeenCalled();
    expect(mintMachineAccessToken).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.deployKeyInvalid,
      message: "Environment Deploy Key is invalid.",
      retryable: false,
    });
    expect(writeAuditEvent).toHaveBeenCalledWith({
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineDeployKeyExchangeDenied,
      outcome: "denied",
      actor: { type: "machine", machineIdentityId: MACHINE },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      denial: { reasonCode: AUTH_ERROR_CODES.deployKeyInvalid },
      details: { deployKeyDenialKind: "auth.deploy_key_denial.invalid" },
    });
  });

  it("mints when runtimePolicyKeyId is allowlisted", async () => {
    vi.mocked(mintMachineAccessToken).mockResolvedValue({
      accessToken: "machine-access-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: createFakeTenantSql(() => []),
      runtimePolicyKeyId: ALLOWED_POLICY_KEY,
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(true);
    expect(mintMachineAccessToken).toHaveBeenCalledOnce();
  });
});
