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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeTenantSql } from "../../operations/test/helpers/fake-tenant-sql.js";
import { DEPLOY_KEY_SECRET_ALGORITHM } from "../src/deploy-key-secret.js";
import {
  exchangeEnvironmentDeployKey,
  resolveDeployKeyExchangeRuntimePolicyKeyId,
} from "../src/exchange-environment-deploy-key.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "../src/environment-deploy-key-auth-method-row.js";
import { mintMachineAccessToken } from "../src/machine-access-token.js";
import { createDeployKeyTestSecret } from "./helpers/deploy-key-test-secret.js";

vi.mock("@insecur/audit", () => ({
  PRODUCTION_AUDIT_EVENT_CODES: {
    machineDeployKeyExchanged: "machine_auth.deploy_key_exchanged",
    machineDeployKeyExchangeDenied: "machine_auth.deploy_key_exchange_denied",
  },
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

const deployKeySecretHolder = { value: "" };

vi.mock("../src/deploy-key-secret.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/deploy-key-secret.js")>();
  return {
    ...actual,
    verifyDeployKeySecret: vi.fn((secret: string) => secret === deployKeySecretHolder.value),
  };
});

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
const SECOND_ALLOWED_POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000003");
const DISALLOWED_POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000002");
const SIGNING_SECRET = "unit-machine-access-signing-secret";
const NOW = 1_700_000_000;

function authMethodRow(
  overrides: Partial<EnvironmentDeployKeyAuthMethodRow> = {},
): EnvironmentDeployKeyAuthMethodRow {
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
    ...overrides,
  };
}

function sqlReturningAuthMethods(
  rows: readonly EnvironmentDeployKeyAuthMethodRow[] = [authMethodRow()],
) {
  return createFakeTenantSql((_query, values) => {
    expect(values[0]).toBe(ORG);
    return rows.map((row) => ({
      id: row.id,
      org_id: row.organizationId,
      machine_identity_id: row.machineIdentityId,
      project_id: row.projectId,
      environment_id: row.environmentId,
      runtime_policy_key_ids: [...row.runtimePolicyKeyIds],
      credential_scopes: [...row.credentialScopes],
      secret_hash_algorithm: row.secretVerifier.algorithm,
      secret_hash_salt_b64: row.secretVerifier.saltB64,
      secret_hash_b64: row.secretVerifier.hashB64,
      status: row.status,
      expires_at: row.expiresAt,
      non_expiring: row.nonExpiring,
      rotation_interval_seconds: row.rotationIntervalSeconds,
      rotation_reminder_interval_seconds: row.rotationReminderIntervalSeconds,
      created_at: row.createdAt,
    }));
  });
}

describe("resolveDeployKeyExchangeRuntimePolicyKeyId", () => {
  it("auto-binds the sole allowlisted runtime policy key when omitted", () => {
    expect(resolveDeployKeyExchangeRuntimePolicyKeyId(authMethodRow(), undefined)).toBe(
      ALLOWED_POLICY_KEY,
    );
  });

  it("requires an explicit runtime policy key when multiple keys are allowlisted", () => {
    expect(
      resolveDeployKeyExchangeRuntimePolicyKeyId(
        authMethodRow({
          runtimePolicyKeyIds: [ALLOWED_POLICY_KEY, SECOND_ALLOWED_POLICY_KEY],
        }),
        undefined,
      ),
    ).toBeNull();
  });

  it("allows exchange when runtimePolicyKeyId is on the deploy key allowlist", () => {
    expect(resolveDeployKeyExchangeRuntimePolicyKeyId(authMethodRow(), ALLOWED_POLICY_KEY)).toBe(
      ALLOWED_POLICY_KEY,
    );
  });

  it("rejects exchange when runtimePolicyKeyId is outside the deploy key allowlist", () => {
    expect(
      resolveDeployKeyExchangeRuntimePolicyKeyId(authMethodRow(), DISALLOWED_POLICY_KEY),
    ).toBeNull();
  });
});

describe("exchangeEnvironmentDeployKey runtimePolicyKeyId allowlist branch", () => {
  beforeAll(() => {
    deployKeySecretHolder.value = createDeployKeyTestSecret();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed with deployKeyInvalid when runtimePolicyKeyId is outside the allowlist", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: deployKeySecretHolder.value,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods(),
      runtimePolicyKeyId: DISALLOWED_POLICY_KEY,
      nowEpoch: NOW,
    });

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

  it("fails closed when multiple allowlisted keys are configured but none is requested", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: deployKeySecretHolder.value,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods([
        authMethodRow({
          runtimePolicyKeyIds: [ALLOWED_POLICY_KEY, SECOND_ALLOWED_POLICY_KEY],
        }),
      ]),
      nowEpoch: NOW,
    });

    expect(mintMachineAccessToken).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.deployKeyInvalid);
    }
  });

  it("binds the resolved runtime policy key into the minted machine access token", async () => {
    vi.mocked(mintMachineAccessToken).mockResolvedValue({
      accessToken: "machine-access-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: deployKeySecretHolder.value,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods(),
      runtimePolicyKeyId: ALLOWED_POLICY_KEY,
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(true);
    expect(mintMachineAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimePolicyKeyId: ALLOWED_POLICY_KEY,
      }),
    );
  });
});
