import {
  AUTHORIZATION_SCOPES,
  auditAccessDenialOnFailure,
  resolveEffectiveAccess,
} from "@insecur/access";
import { auditActorUserId, recordRuntimeInjectionAudit } from "@insecur/audit";
import { PlaintextHandle } from "@insecur/crypto";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
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
import { decryptBoundGrantSecretVersion } from "../src/decrypt-grant-secret.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const ACTOR_USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const VARIABLE_KEY = "TEST_KEY" as VariableKey;

const loadedBinding = {
  projectId: PROJECT,
  environmentId: ENV,
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
};

const plaintextHandle = new PlaintextHandle(new TextEncoder().encode("runtime-secret"));

const tryConsumeGrant = vi.fn();
const getGrant = vi.fn();
const getBoundGrant = vi.fn();

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    getGrant = getGrant;
    getBoundGrant = getBoundGrant;
    tryConsumeGrant = tryConsumeGrant;
  }
  const withTenantScope = vi.fn(
    async (_scope: unknown, fn: (ctx: { db: unknown }) => Promise<unknown>) => fn({ db: {} }),
  );
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
  auditActorUserId: vi.fn((actor: { userId: string }) => actor.userId),
  recordRuntimeInjectionAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
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
    secret_version_id: SECRET_VERSION,
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
  vi.mocked(auditActorUserId).mockClear();
  vi.mocked(resolveEffectiveAccess).mockReset();
  vi.mocked(recordRuntimeInjectionAudit).mockClear();
  vi.mocked(auditAccessDenialOnFailure).mockClear();
  vi.mocked(decryptBoundGrantSecretVersion).mockReset();
  tryConsumeGrant.mockReset();
  getGrant.mockReset();
  getBoundGrant.mockReset();

  vi.mocked(resolveEffectiveAccess).mockResolvedValue({
    scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume],
  });
  tryConsumeGrant.mockResolvedValue({ ok: true, grant: boundGrantFromRow() });
  vi.mocked(decryptBoundGrantSecretVersion).mockResolvedValue(plaintextHandle);
});

describe("executeConsumeInjectionGrant", () => {
  it("denies when the grant binding was not loaded", async () => {
    await expect(executeConsumeInjectionGrant(baseInput, undefined)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
      message: "injection grant not found",
    });

    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("returns insufficient_scope for machine actors before access resolution", async () => {
    await expect(
      executeConsumeInjectionGrant(
        {
          ...baseInput,
          actor: { type: "machine", machineIdentityId: MACHINE },
        },
        loadedBinding,
      ),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(auditActorUserId).not.toHaveBeenCalled();
    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("returns insufficient_scope for ci_exchange actors before access resolution", async () => {
    await expect(
      executeConsumeInjectionGrant(
        {
          ...baseInput,
          actor: { type: "ci_exchange" },
        },
        loadedBinding,
      ),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(auditActorUserId).not.toHaveBeenCalled();
    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrant).not.toHaveBeenCalled();
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

    expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
  });

  it.each(["already_consumed", "not_found", "binding_not_allowed"] as const)(
    "maps %s consume failures to grant_denied",
    async (reason) => {
      tryConsumeGrant.mockResolvedValue({ ok: false, reason });

      await expect(executeConsumeInjectionGrant(baseInput, loadedBinding)).rejects.toMatchObject({
        code: INJECTION_ERROR_CODES.grantDenied,
        message: "injection grant consume denied",
      });

      expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
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

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
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

  it("omits auditEventId when consume success audit returns no id", async () => {
    vi.mocked(recordRuntimeInjectionAudit).mockResolvedValueOnce(undefined);

    const result = await executeConsumeInjectionGrant(baseInput, loadedBinding);

    expect(result.auditEventId).toBeUndefined();
    expect(result.valueUtf8).toBe(plaintextHandle);
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
});

describe("consumeInjectionGrantWithAudit", () => {
  it("denies with org-only audit when grant id does not resolve to a binding", async () => {
    getGrant.mockResolvedValue(null);

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });

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
        reasonCode: INJECTION_ERROR_CODES.grantDenied,
      }),
    );
    expect(tryConsumeGrant).not.toHaveBeenCalled();
  });

  it("denies with org-only audit when grant row has no single binding", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(null);

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: INJECTION_ERROR_CODES.grantDenied,
      }),
    );
  });

  it("loads grant binding and completes a successful consume", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());

    const result = await consumeInjectionGrantWithAudit(baseInput);

    expect(getGrant).toHaveBeenCalledWith(ORG, GRANT);
    expect(result.secretId).toBe(SECRET);
    expect(result.valueUtf8).toBe(plaintextHandle);
  });

  it("records insufficient_scope denial through auditAccessDenialOnFailure", async () => {
    getGrant.mockResolvedValue(grantRow());
    getBoundGrant.mockReturnValue(boundGrantFromRow());
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

    await expect(consumeInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(auditAccessDenialOnFailure).toHaveBeenCalled();
    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    );
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
});
