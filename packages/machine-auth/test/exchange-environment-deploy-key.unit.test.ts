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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEPLOY_KEY_SECRET_ALGORITHM } from "../src/deploy-key-secret.js";
import { exchangeEnvironmentDeployKey } from "../src/exchange-environment-deploy-key.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "../src/environment-deploy-key-auth-method-row.js";
import { createFakeTenantSql } from "../../operations/test/helpers/fake-tenant-sql.js";

vi.mock("@insecur/audit", () => ({
  PRODUCTION_AUDIT_EVENT_CODES: {
    machineDeployKeyExchanged: "machine.deploy_key.exchanged",
    machineDeployKeyExchangeDenied: "machine.deploy_key.exchange_denied",
  },
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const OTHER_ENV = environmentId.brand("env_00000000000000000000000002");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000004");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const OTHER_POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000002");
const SIGNING_SECRET = "unit-machine-access-signing-secret";
const DEPLOY_KEY_SECRET = "unit-deploy-key-secret";
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
    runtimePolicyKeyIds: [POLICY_KEY],
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

vi.mock("../src/deploy-key-secret.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/deploy-key-secret.js")>();
  return {
    ...actual,
    verifyDeployKeySecret: vi.fn((secret: string) => secret === DEPLOY_KEY_SECRET),
  };
});

describe("exchangeEnvironmentDeployKey (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a trusted deploy key for a short-lived machine access token", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods(),
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.machineIdentityId).toBe(MACHINE);
      expect(result.environmentId).toBe(ENV);
      expect(result.runtimePolicyKeyIds).toEqual([POLICY_KEY]);
    }
  });

  it("denies disabled deploy keys before minting", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods([authMethodRow({ status: "disabled" })]),
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.deployKeyDisabled,
      message: "Environment Deploy Key is disabled.",
      retryable: false,
    });
  });

  it("denies expired deploy keys before minting", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods([
        authMethodRow({ expiresAt: new Date((NOW - 60) * 1000), nonExpiring: false }),
      ]),
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.expired);
    }
  });

  it("denies wrong-environment exchange before minting", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: OTHER_ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods(),
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.deployKeyWrongEnvironment,
      message: "Environment Deploy Key is not authorized for this project and environment.",
      retryable: false,
    });
  });

  it("denies overbroad credential scopes before minting", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods([
        authMethodRow({
          credentialScopes: [
            CREDENTIAL_SCOPES.runtimeInjectionRun,
            CREDENTIAL_SCOPES.secretNonProtectedWrite,
          ],
        }),
      ]),
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.deployKeyOverbroadScope,
      message: "Environment Deploy Key credential scopes are overbroad.",
      retryable: false,
    });
  });

  it("denies runtime policy key ids outside the deploy key allowlist before minting", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods(),
      runtimePolicyKeyId: OTHER_POLICY_KEY,
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.deployKeyInvalid,
      message: "Environment Deploy Key is invalid.",
      retryable: false,
    });
  });

  it("exchanges when the requested runtime policy key id is allowlisted", async () => {
    const result = await exchangeEnvironmentDeployKey({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      deployKeySecret: DEPLOY_KEY_SECRET,
      signingSecret: SIGNING_SECRET,
      sql: sqlReturningAuthMethods(),
      runtimePolicyKeyId: POLICY_KEY,
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(true);
  });
});
