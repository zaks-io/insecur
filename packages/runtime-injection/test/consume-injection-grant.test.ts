import {
  AUTHORIZATION_SCOPES,
  auditAccessDenialOnFailure,
  resolveEffectiveAccess,
} from "@insecur/access";
import {
  recordRuntimeInjectionAudit,
  recordRuntimeInjectionAuditInTenantScope,
} from "@insecur/audit";
import { PlaintextHandle } from "@insecur/crypto";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  runtimePolicyId,
  secretId,
  secretVersionId,
  userId,
  machineIdentityId,
  type VariableKey,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeInjectionGrantWithAudit,
  executeConsumeInjectionGrant,
  recordDeniedConsume,
} from "../src/consume-injection-grant.js";
import { FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH } from "@insecur/storage-security-gate";
import { decryptBoundGrantSecretVersion } from "../src/decrypt-grant-secret.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const ACTOR_USER = userId.brand("usr_00000000000000000000000001");
const OTHER_USER = userId.brand("usr_00000000000000000000000002");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const POLICY = runtimePolicyId.brand("rp_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const VARIABLE_KEY = "TEST_KEY" as VariableKey;

const loadedBinding = {
  projectId: PROJECT,
  environmentId: ENV,
  issuedTo: { type: "user" as const, userId: ACTOR_USER },
  binding: {
    secretId: SECRET,
    secretVersionId: SECRET_VERSION,
    variableKey: VARIABLE_KEY,
  },
};

const baseInput = {
  keyring: {} as never,
  organizationId: ORG,
  grantId: GRANT,
  selector: { kind: "variable_key" as const, variableKey: VARIABLE_KEY },
  actor: { type: "user" as const, userId: ACTOR_USER },
  deliveryPath: FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
};

let plaintextHandle = new PlaintextHandle(new TextEncoder().encode("runtime-secret"));

const { tryConsumeGrant, getGrant, getBoundGrant, withTenantScope } = vi.hoisted(() => ({
  tryConsumeGrant: vi.fn(),
  getGrant: vi.fn(),
  getBoundGrant: vi.fn(),
  withTenantScope: vi.fn(
    async (_scope: unknown, fn: (ctx: { db: unknown; sql: unknown }) => Promise<unknown>) =>
      fn({ db: {}, sql: {} }),
  ),
}));

const ORG_TENANT_SCOPE = { kind: "organization" as const, organizationId: ORG };

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    getGrant = getGrant;
    getBoundGrant = getBoundGrant;
    isPolicyBackedGrant = vi.fn(() => false);
    tryConsumeGrant = tryConsumeGrant;
  }
  return {
    ...actual,
    withTenantScope,
    TenantInjectionGrantStore: MockTenantInjectionGrantStore,
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: vi.fn(actual.resolveEffectiveAccess),
    auditAccessDenialOnFailure: vi.fn(async (error, options) => {
      await actual.auditAccessDenialOnFailure(error, options);
    }),
  };
});

vi.mock("@insecur/audit", () => ({
  recordRuntimeInjectionAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  recordRuntimeInjectionAuditInTenantScope: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

vi.mock("../src/decrypt-grant-secret.js", () => ({
  decryptBoundGrantSecretVersion: vi.fn(),
}));

function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GRANT,
    org_id: ORG,
    project_id: PROJECT,
    environment_id: ENV,
    variable_keys: [VARIABLE_KEY],
    secret_ids: [SECRET],
    secret_version_ids: [SECRET_VERSION],
    policy_id: null,
    policy_version_id: null,
    issued_actor_type: "user",
    issued_user_id: ACTOR_USER,
    issued_machine_identity_id: null,
    issued_runtime_policy_key_id: null,
    expires_at: new Date(Date.now() + 60_000),
    consumed_at: null,
    ...overrides,
  };
}

function boundGrantFromRow() {
  return {
    grantId: GRANT,
    projectId: PROJECT,
    environmentId: ENV,
    secretId: SECRET,
    secretVersionId: SECRET_VERSION,
    variableKey: VARIABLE_KEY,
  };
}

beforeEach(() => {
  plaintextHandle = new PlaintextHandle(new TextEncoder().encode("runtime-secret"));
  vi.mocked(resolveEffectiveAccess).mockReset();
  vi.mocked(recordRuntimeInjectionAudit).mockClear();
  vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockReset();
  vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockResolvedValue({
    auditEventId: "aud_test",
  });
  vi.mocked(auditAccessDenialOnFailure).mockClear();
  vi.mocked(decryptBoundGrantSecretVersion).mockReset();
  tryConsumeGrant.mockReset();
  getGrant.mockReset();
  getBoundGrant.mockReset();
  withTenantScope.mockReset();
  withTenantScope.mockImplementation(async (_scope, callback) => callback({ db: {}, sql: {} }));

  vi.mocked(resolveEffectiveAccess).mockResolvedValue({
    scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume],
  });
  tryConsumeGrant.mockResolvedValue({ ok: true, grant: boundGrantFromRow() });
  vi.mocked(decryptBoundGrantSecretVersion).mockResolvedValue(plaintextHandle);
});

describe("executeConsumeInjectionGrant", () => {
  it("returns insufficient_scope (not grant_denied) when the grant binding was not loaded", async () => {
    // A not-found grant has no coordinate to authorize against, so it collapses to the same code an
    // unauthorized caller gets at the per-coordinate check below — the consume path must not be a
    // grant-existence oracle (INS-181).
    await expect(executeConsumeInjectionGrant(baseInput, undefined)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("allows the issuing machine credential context to consume its grant", async () => {
    const machineActor = {
      type: "machine" as const,
      machineIdentityId: MACHINE,
      tokenScope: {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      },
      credentialScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume],
    };
    await expect(
      executeConsumeInjectionGrant(
        { ...baseInput, actor: machineActor },
        {
          ...loadedBinding,
          issuedTo: {
            type: "machine",
            machineIdentityId: MACHINE,
            runtimePolicyKeyId: POLICY,
          },
        },
      ),
    ).resolves.toMatchObject({ variableKey: VARIABLE_KEY });

    expect(resolveEffectiveAccess).toHaveBeenCalledWith(
      machineActor,
      expect.any(Object),
      undefined,
    );
    expect(tryConsumeGrant).toHaveBeenCalledOnce();
  });

  it("denies a policy-bound machine credential from consuming another policy context", async () => {
    const machineActor = {
      type: "machine" as const,
      machineIdentityId: MACHINE,
      tokenScope: {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        runtimePolicyKeyId: runtimePolicyId.brand("rp_00000000000000000000000002"),
      },
      credentialScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume],
    };

    await expect(
      executeConsumeInjectionGrant(
        { ...baseInput, actor: machineActor },
        {
          ...loadedBinding,
          issuedTo: {
            type: "machine",
            machineIdentityId: MACHINE,
            runtimePolicyKeyId: POLICY,
          },
        },
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(tryConsumeGrant).not.toHaveBeenCalled();
    expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
  });

  it("denies when effective access lacks runtime_injection:grant_consume", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

    await expect(executeConsumeInjectionGrant(baseInput, loadedBinding)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(resolveEffectiveAccess).toHaveBeenCalledWith(
      { type: "user", userId: ACTOR_USER },
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      undefined,
    );
    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("denies a different authorized principal before consuming the grant", async () => {
    await expect(
      executeConsumeInjectionGrant(
        { ...baseInput, actor: { type: "user", userId: OTHER_USER } },
        loadedBinding,
      ),
      // Same code as a missing grant: a distinct owner-mismatch code would be a grant-existence
      // oracle (INS-181).
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(tryConsumeGrant).not.toHaveBeenCalled();
    expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
  });

  it("denies when the variable key selector does not match the grant binding", async () => {
    await expect(
      executeConsumeInjectionGrant(
        {
          ...baseInput,
          selector: { kind: "variable_key", variableKey: "OTHER_KEY" as VariableKey },
        },
        loadedBinding,
      ),
    ).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });

    expect(tryConsumeGrant).not.toHaveBeenCalled();
    expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
  });

  it("denies when the secret id selector does not match the grant binding", async () => {
    await expect(
      executeConsumeInjectionGrant(
        {
          ...baseInput,
          selector: { kind: "secret_id", secretId: secretId.generate() },
        },
        loadedBinding,
      ),
    ).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });

    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("maps expired consume failures to grant_expired", async () => {
    tryConsumeGrant.mockResolvedValue({ ok: false, reason: "expired" });

    await expect(executeConsumeInjectionGrant(baseInput, loadedBinding)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantExpired,
      message: "injection grant consume denied",
    });

    expect(decryptBoundGrantSecretVersion).toHaveBeenCalledOnce();
    expect(plaintextHandle.unwrapUtf8()).toEqual(new Uint8Array("runtime-secret".length));
  });

  it.each(["already_consumed", "not_found", "binding_not_allowed"] as const)(
    "maps %s consume failures to grant_denied",
    async (reason) => {
      tryConsumeGrant.mockResolvedValue({ ok: false, reason });

      await expect(executeConsumeInjectionGrant(baseInput, loadedBinding)).rejects.toMatchObject({
        code: INJECTION_ERROR_CODES.grantDenied,
        message: "injection grant consume denied",
      });

      expect(decryptBoundGrantSecretVersion).toHaveBeenCalledOnce();
    },
  );

  it("consumes by secret id selector and returns bound metadata with plaintext", async () => {
    const result = await executeConsumeInjectionGrant(
      {
        ...baseInput,
        selector: { kind: "secret_id", secretId: SECRET },
      },
      loadedBinding,
    );

    expect(tryConsumeGrant).toHaveBeenCalledWith(ORG, GRANT, SECRET, VARIABLE_KEY);
    expect(withTenantScope).toHaveBeenCalledWith(ORG_TENANT_SCOPE, expect.any(Function));
    expect(decryptBoundGrantSecretVersion).toHaveBeenCalledWith({
      keyring: baseInput.keyring,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET,
      secretVersionId: SECRET_VERSION,
    });
    expect(result).toEqual({
      secretId: SECRET,
      secretVersionId: SECRET_VERSION,
      variableKey: VARIABLE_KEY,
      valueUtf8: plaintextHandle,
      auditEventId: "aud_test",
    });
  });

  it("records consume success audit with request and operation refs when provided", async () => {
    const request = { requestId: "req_test" as never };
    const operation = { operationId: "op_test" as never };

    await executeConsumeInjectionGrant(
      {
        ...baseInput,
        request,
        operation,
      },
      loadedBinding,
    );

    expect(recordRuntimeInjectionAuditInTenantScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phase: "consume",
        outcome: "success",
        request,
        operation,
        grantId: GRANT,
        deliveredSecretVersionId: SECRET_VERSION,
      }),
    );
  });

  it("rolls back consume and clears plaintext when success audit insertion fails", async () => {
    let staged = false;
    let committed = false;
    tryConsumeGrant.mockImplementation(async () => {
      staged = true;
      return { ok: true, grant: boundGrantFromRow() };
    });
    withTenantScope.mockImplementation(async (_scope, callback) => {
      try {
        const result = await callback({ db: {}, sql: {} });
        committed = staged;
        return result;
      } catch (error) {
        staged = false;
        throw error;
      }
    });
    vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockRejectedValueOnce(
      new Error("audit insert failed"),
    );

    await expect(executeConsumeInjectionGrant(baseInput, loadedBinding)).rejects.toThrow(
      "audit insert failed",
    );

    expect(tryConsumeGrant).toHaveBeenCalledOnce();
    expect(recordRuntimeInjectionAuditInTenantScope).toHaveBeenCalledOnce();
    expect(committed).toBe(false);
    expect(plaintextHandle.unwrapUtf8()).toEqual(new Uint8Array("runtime-secret".length));
  });

  it("returns bound metadata with a plaintext handle only (no rendered secret value field)", async () => {
    const result = await executeConsumeInjectionGrant(baseInput, loadedBinding);

    expect(Object.keys(result).sort()).toEqual(
      ["auditEventId", "secretId", "secretVersionId", "valueUtf8", "variableKey"].sort(),
    );
    expect(result.valueUtf8).toBeInstanceOf(PlaintextHandle);
    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("plaintext");
    expect(result).not.toHaveProperty("renderedValue");
  });
});

describe("recordDeniedConsume", () => {
  it("records org-only denied consume audit when coordinate is omitted", async () => {
    await recordDeniedConsume(baseInput, INJECTION_ERROR_CODES.grantDenied);

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith({
      phase: "consume",
      outcome: "denied",
      actor: baseInput.actor,
      organizationId: ORG,
      grantId: GRANT,
      reasonCode: INJECTION_ERROR_CODES.grantDenied,
    });
  });

  it("records project and environment coordinates on denied consume audit", async () => {
    await recordDeniedConsume(baseInput, INJECTION_ERROR_CODES.grantExpired, {
      projectId: PROJECT,
      environmentId: ENV,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT,
        environmentId: ENV,
        reasonCode: INJECTION_ERROR_CODES.grantExpired,
      }),
    );
  });

  it("forwards request and operation refs on denied consume audit", async () => {
    const request = { requestId: "req_denied" as never };
    const operation = { operationId: "op_denied" as never };

    await recordDeniedConsume(
      { ...baseInput, request, operation },
      INJECTION_ERROR_CODES.grantDenied,
      { projectId: PROJECT, environmentId: ENV },
    );

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        operation,
        reasonCode: INJECTION_ERROR_CODES.grantDenied,
      }),
    );
  });
});

describe("consumeInjectionGrantWithAudit", () => {
  it("denies insufficient_scope with org-only audit when grant id does not resolve to a binding", async () => {
    getGrant.mockResolvedValue(null);

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    // No grant => no coordinate to authorize against; the denial collapses to insufficient_scope
    // (oracle closure) and the audit carries no project/environment coordinate.
    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.not.objectContaining({
        projectId: expect.anything(),
        environmentId: expect.anything(),
      }),
    );
    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "consume",
        outcome: "denied",
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("denies insufficient_scope when grant row has no single binding", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(null);

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("loads grant binding and completes a successful consume", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());

    const result = await consumeInjectionGrantWithAudit(baseInput);

    expect(getGrant).toHaveBeenCalledWith(ORG, GRANT);
    expect(withTenantScope).toHaveBeenCalledWith(ORG_TENANT_SCOPE, expect.any(Function));
    expect(withTenantScope.mock.calls.map(([scope]) => scope)).toEqual([
      ORG_TENANT_SCOPE,
      ORG_TENANT_SCOPE,
    ]);
    expect(result.secretId).toBe(SECRET);
    expect(result.valueUtf8).toBe(plaintextHandle);
  });

  it("scopes loadGrantBinding and tryConsumeGrant to the organization tenant", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());

    await consumeInjectionGrantWithAudit(baseInput);

    expect(withTenantScope).toHaveBeenCalledTimes(2);
    expect(withTenantScope.mock.calls[0]?.[0]).toEqual(ORG_TENANT_SCOPE);
    expect(withTenantScope.mock.calls[1]?.[0]).toEqual(ORG_TENANT_SCOPE);
  });

  it("denies insufficient_scope when access lacks consume scope at the grant's coordinate", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    // Authorization happens at the grant's real project/environment coordinate, never an org-only
    // coordinate (which would drop project-scoped memberships and over-deny — see the next test).
    expect(resolveEffectiveAccess).toHaveBeenCalledWith(
      { type: "user", userId: ACTOR_USER },
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      undefined,
    );
    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    );
  });

  it("allows a consumer holding consume scope ONLY at the grant's project coordinate", async () => {
    // Regression for the over-deny bug: a project-scoped consumer (e.g. the developer preset) holds
    // runtime_injection:grant_consume only at {org, project, env}, not org-wide. Authorizing at the
    // grant's real coordinate must let them consume a valid grant in their own project. A
    // coordinate-aware mock returns the consume scope at the project coordinate but NOT org-wide.
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    vi.mocked(resolveEffectiveAccess).mockImplementation(async (_actor, coordinate) =>
      coordinate.projectId === PROJECT && coordinate.environmentId === ENV
        ? { scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume] }
        : { scopes: [] },
    );

    const result = await consumeInjectionGrantWithAudit(baseInput);

    expect(result.secretId).toBe(SECRET);
    expect(result.valueUtf8).toBe(plaintextHandle);
    expect(tryConsumeGrant).toHaveBeenCalled();
  });

  it("returns the SAME code for a missing grant and a no-scope caller (closes the existence oracle)", async () => {
    // No-scope caller against a present grant: denied at the per-coordinate check.
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });
    const presentNoScope = await consumeInjectionGrantWithAudit(baseInput).catch((e) => e.code);

    // Any caller hitting a grant id that does not exist (or is not in their RLS-scoped tenant).
    getGrant.mockResolvedValue(null);
    const missing = await consumeInjectionGrantWithAudit(baseInput).catch((e) => e.code);

    // Both surface insufficient_scope, so the error code cannot distinguish "grant absent" from
    // "grant present but you lack consume scope" — the existence oracle is closed.
    expect(presentNoScope).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect(missing).toBe(AUTH_ERROR_CODES.insufficientScope);
  });

  it("records grant_denied with coordinate when selector mismatches loaded binding", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());

    await expect(
      consumeInjectionGrantWithAudit({
        ...baseInput,
        selector: { kind: "variable_key", variableKey: "OTHER_KEY" as VariableKey },
      }),
    ).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: INJECTION_ERROR_CODES.grantDenied,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    );
  });

  it("does not double-record denied consume audit for insufficient_scope", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    const deniedCalls = vi
      .mocked(recordRuntimeInjectionAudit)
      .mock.calls.filter((call) => call[0]?.outcome === "denied");
    expect(deniedCalls).toHaveLength(1);
  });

  it("records grant_expired denied audit with coordinate when consume store rejects expiry", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    tryConsumeGrant.mockResolvedValue({ ok: false, reason: "expired" });

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantExpired,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "consume",
        outcome: "denied",
        reasonCode: INJECTION_ERROR_CODES.grantExpired,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    );
  });

  it("rethrows non-injection errors without recording denied consume audit", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    vi.mocked(decryptBoundGrantSecretVersion).mockRejectedValue(new Error("decrypt failed"));

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toThrow("decrypt failed");

    expect(tryConsumeGrant).not.toHaveBeenCalled();

    expect(recordRuntimeInjectionAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "denied" }),
    );
  });

  it("swallows denied audit write failures for non-scope injection errors", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    tryConsumeGrant.mockResolvedValue({ ok: false, reason: "already_consumed" });
    vi.mocked(recordRuntimeInjectionAudit).mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });
  });
});
