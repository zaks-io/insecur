import {
  AUTHORIZATION_SCOPES,
  CREDENTIAL_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type LoadMachineMembershipsFn,
  type MachineMembershipRow,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineIdentityId,
  membershipId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { enforceMachineAccessToken } from "../src/enforce-machine-access-token.js";
import { machineAccessTokenDenialDetail } from "../src/machine-access-token-denial.js";
import { machineActorFromVerifiedMachineAccessToken } from "../src/machine-actor-from-verified-token.js";
import { mintMachineAccessToken } from "../src/machine-access-token.js";

vi.mock("@insecur/audit", () => ({
  PRODUCTION_AUDIT_EVENT_CODES: {
    machineAuthAccessTokenUsed: "machine_auth.access_token_used",
    machineAuthAccessTokenDenied: "machine_auth.access_token_denied",
  },
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, auditEventId: "aud_TEST" }),
}));

import { writeAuditEvent } from "@insecur/audit";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const OTHER_ENV = environmentId.brand("env_00000000000000000000000002");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const OTHER_POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000002");
const SECRET = "test-machine-access-signing-secret";
const MEMBERSHIP = membershipId.brand("mem_00000000000000000000000001");

function machineMembership(
  authorizationScopes: MachineMembershipRow["authorizationScopes"],
): MachineMembershipRow {
  return {
    membershipId: MEMBERSHIP,
    organizationId: ORG,
    projectId: PROJECT,
    machineIdentityId: MACHINE,
    authorizationScopes,
  };
}

async function mintAccessToken(
  overrides: Partial<{
    environmentId: typeof ENV;
    runtimePolicyKeyId: typeof POLICY_KEY;
    credentialScopes: readonly (typeof CREDENTIAL_SCOPES)[keyof typeof CREDENTIAL_SCOPES][];
    ttlSeconds: number;
  }> = {},
) {
  return mintMachineAccessToken({
    machineIdentityId: MACHINE,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: overrides.environmentId ?? ENV,
    runtimePolicyKeyId: overrides.runtimePolicyKeyId ?? POLICY_KEY,
    credentialScopes: overrides.credentialScopes ?? [CREDENTIAL_SCOPES.runtimeInjectionRun],
    signingSecret: SECRET,
    ttlSeconds: overrides.ttlSeconds ?? 60,
  });
}

describe("enforceMachineAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid token bound to the request coordinate", async () => {
    const minted = await mintAccessToken();
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      runtimePolicyKeyId: POLICY_KEY,
      requiredCredentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    });

    expect(enforced.ok).toBe(true);
    if (enforced.ok) {
      expect(enforced.actor).toEqual(machineActorFromVerifiedMachineAccessToken(enforced.token));
      expect(enforced.token.credentialScopes).toEqual([CREDENTIAL_SCOPES.runtimeInjectionRun]);
    }
  });

  it("rejects expired tokens with stable denial metadata", async () => {
    const minted = await mintAccessToken({ ttlSeconds: -10 });
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
    });

    expect(enforced).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.expired,
      denialKind: "expired",
      message: "Machine access token has expired.",
    });
    expect(machineAccessTokenDenialDetail("expired")).toEqual({
      machineAccessDenialKind: "auth.machine_access_denial.expired",
    });
  });

  it("rejects wrong-environment tokens before authorization resolution", async () => {
    const minted = await mintAccessToken();
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: OTHER_ENV },
    });

    expect(enforced.ok).toBe(false);
    if (!enforced.ok) {
      expect(enforced.code).toBe(AUTH_ERROR_CODES.invalid);
      expect(enforced.denialKind).toBe("wrong_environment");
      expect(machineAccessTokenDenialDetail(enforced.denialKind)).toEqual({
        machineAccessDenialKind: "auth.machine_access_denial.wrong_environment",
      });
    }
  });

  it("rejects wrong-runtime-policy tokens", async () => {
    const minted = await mintAccessToken();
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      runtimePolicyKeyId: OTHER_POLICY_KEY,
    });

    expect(enforced.ok).toBe(false);
    if (!enforced.ok) {
      expect(enforced.denialKind).toBe("wrong_runtime_policy");
    }
  });

  it("rejects tokens missing required credential scopes", async () => {
    const minted = await mintAccessToken({
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    });
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      requiredCredentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
      ],
    });

    expect(enforced).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.insufficientScope,
      denialKind: "insufficient_credential_scope",
      message: "Machine access token credential scopes are insufficient for this request.",
    });
  });

  it("records metadata-only audit events when audit context is provided", async () => {
    const minted = await mintAccessToken();
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      runtimePolicyKeyId: POLICY_KEY,
      audit: { credentialMethod: "environment_deploy_key" },
    });

    expect(enforced.ok).toBe(true);
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "machine_auth.access_token_used",
        outcome: "success",
        details: expect.objectContaining({
          credentialMethod: "auth.credential_method.environment_deploy_key",
        }),
      }),
    );
    expect(JSON.stringify(vi.mocked(writeAuditEvent).mock.calls[0]?.[0])).not.toMatch(
      /secret|password|plaintext|bearer/i,
    );
  });

  it("records expiry denial audit without token material", async () => {
    const minted = await mintAccessToken({ ttlSeconds: -10 });
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      audit: { credentialMethod: "github_actions_oidc" },
    });

    expect(enforced.ok).toBe(false);
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "machine_auth.access_token_denied",
        outcome: "denied",
        details: expect.objectContaining({
          machineAccessDenialKind: "auth.machine_access_denial.expired",
        }),
      }),
    );
  });
});

describe("machine access token scope intersection and human-only gates", () => {
  it("intersects membership, token scope, and credential scopes for enforced tokens", async () => {
    const minted = await mintAccessToken({
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
      ],
    });
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      runtimePolicyKeyId: POLICY_KEY,
    });
    expect(enforced.ok).toBe(true);
    if (!enforced.ok) {
      return;
    }

    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership([
        AUTHORIZATION_SCOPES.runtimeInjectionRun,
        AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
        AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
        AUTHORIZATION_SCOPES.secretNonProtectedWrite,
      ]),
    ]);

    const effectiveAccess = await resolveEffectiveAccess(
      enforced.actor,
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      { loadMachineMemberships },
    );

    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(
      true,
    );
    expect(
      hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue),
    ).toBe(true);
    expect(
      hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume),
    ).toBe(false);
    expect(
      hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.secretNonProtectedWrite),
    ).toBe(false);
  });

  it("denies human approval authority even when membership grants approval scopes", async () => {
    const minted = await mintAccessToken({
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
      ],
    });
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      runtimePolicyKeyId: POLICY_KEY,
    });
    expect(enforced.ok).toBe(true);
    if (!enforced.ok) {
      return;
    }

    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership([
        AUTHORIZATION_SCOPES.runtimeInjectionRun,
        AUTHORIZATION_SCOPES.approvalApprove,
        AUTHORIZATION_SCOPES.approvalReject,
      ]),
    ]);

    const effectiveAccess = await resolveEffectiveAccess(
      enforced.actor,
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      { loadMachineMemberships },
    );

    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(
      true,
    );
    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.approvalApprove)).toBe(
      false,
    );
    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.approvalReject)).toBe(false);
  });

  it("cannot satisfy high-assurance-gated protected configuration via machine token scopes", async () => {
    const minted = await mintAccessToken({
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.projectRead,
        CREDENTIAL_SCOPES.environmentRead,
      ],
    });
    const enforced = await enforceMachineAccessToken({
      accessToken: minted.accessToken,
      signingSecret: SECRET,
      coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      runtimePolicyKeyId: POLICY_KEY,
    });
    expect(enforced.ok).toBe(true);
    if (!enforced.ok) {
      return;
    }

    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership([
        AUTHORIZATION_SCOPES.runtimeInjectionRun,
        AUTHORIZATION_SCOPES.projectConfigure,
        AUTHORIZATION_SCOPES.metadataDetailRead,
      ]),
    ]);

    const effectiveAccess = await resolveEffectiveAccess(
      enforced.actor,
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      { loadMachineMemberships },
    );

    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.projectConfigure)).toBe(
      false,
    );
    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.metadataDetailRead)).toBe(
      false,
    );
    expect(effectiveAccess.scopes).not.toContain(AUTHORIZATION_SCOPES.approvalApprove);
  });
});
