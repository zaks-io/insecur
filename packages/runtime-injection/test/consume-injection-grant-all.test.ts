import {
  AUTHORIZATION_SCOPES,
  auditAccessDenialOnFailure,
  resolveEffectiveAccess,
} from "@insecur/access";
import { recordRuntimeInjectionAudit } from "@insecur/audit";
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

import { consumeInjectionGrantAllWithAudit } from "../src/consume-injection-grant-all.js";
import { consumeInjectionGrantAll } from "../src/injection-grants.js";
import { decryptBoundGrantSecretVersion } from "../src/decrypt-grant-secret.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const ACTOR_USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const SECRET_A = secretId.brand("sec_00000000000000000000000001");
const SECRET_B = secretId.brand("sec_00000000000000000000000002");
const VERSION_A = secretVersionId.brand("sv_00000000000000000000000001");
const VERSION_B = secretVersionId.brand("sv_00000000000000000000000002");
const VARIABLE_KEY_A = "API_KEY" as VariableKey;
const VARIABLE_KEY_B = "DATABASE_URL" as VariableKey;

const baseInput = {
  keyring: {} as never,
  organizationId: ORG,
  grantId: GRANT,
  actor: { type: "user" as const, userId: ACTOR_USER },
};

const plaintextA = new PlaintextHandle(new TextEncoder().encode("runtime-secret-a"));
const plaintextB = new PlaintextHandle(new TextEncoder().encode("runtime-secret-b"));

const { tryConsumeGrantAll, getGrant, getBoundGrants, isPolicyBackedGrant, withTenantScope } =
  vi.hoisted(() => ({
    tryConsumeGrantAll: vi.fn(),
    getGrant: vi.fn(),
    getBoundGrants: vi.fn(),
    isPolicyBackedGrant: vi.fn(),
    withTenantScope: vi.fn(
      async (_scope: unknown, fn: (ctx: { db: unknown }) => Promise<unknown>) => fn({ db: {} }),
    ),
  }));

const ORG_TENANT_SCOPE = { kind: "organization" as const, organizationId: ORG };

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    getGrant = getGrant;
    getBoundGrants = getBoundGrants;
    isPolicyBackedGrant = isPolicyBackedGrant;
    tryConsumeGrantAll = tryConsumeGrantAll;
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
}));

vi.mock("../src/decrypt-grant-secret.js", () => ({
  decryptBoundGrantSecretVersion: vi.fn(),
}));

function policyGrantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GRANT,
    org_id: ORG,
    project_id: PROJECT,
    environment_id: ENV,
    variable_keys: [VARIABLE_KEY_A, VARIABLE_KEY_B],
    secret_ids: [SECRET_A, SECRET_B],
    secret_version_ids: [VERSION_A, VERSION_B],
    policy_id: "rp_00000000000000000000000011",
    policy_version_id: "rpv_00000000000000000000000011",
    expires_at: new Date(Date.now() + 60_000),
    consumed_at: null,
    ...overrides,
  };
}

function policyBindingsFromRow() {
  return [
    {
      grantId: GRANT,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET_A,
      secretVersionId: VERSION_A,
      variableKey: VARIABLE_KEY_A,
    },
    {
      grantId: GRANT,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET_B,
      secretVersionId: VERSION_B,
      variableKey: VARIABLE_KEY_B,
    },
  ];
}

beforeEach(() => {
  vi.mocked(resolveEffectiveAccess).mockReset();
  vi.mocked(recordRuntimeInjectionAudit).mockClear();
  vi.mocked(auditAccessDenialOnFailure).mockClear();
  vi.mocked(decryptBoundGrantSecretVersion).mockReset();
  tryConsumeGrantAll.mockReset();
  getGrant.mockReset();
  getBoundGrants.mockReset();
  isPolicyBackedGrant.mockReset();
  withTenantScope.mockClear();

  vi.mocked(resolveEffectiveAccess).mockResolvedValue({
    scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume],
  });
  isPolicyBackedGrant.mockReturnValue(true);
  getBoundGrants.mockReturnValue(policyBindingsFromRow());
  tryConsumeGrantAll.mockResolvedValue({ ok: true, grants: policyBindingsFromRow() });
  vi.mocked(decryptBoundGrantSecretVersion).mockImplementation(async (input) =>
    input.secretId === SECRET_A ? plaintextA : plaintextB,
  );
});

describe("consumeInjectionGrantAllWithAudit", () => {
  it("returns insufficient_scope when the policy grant binding was not loaded", async () => {
    getGrant.mockResolvedValue(null);

    await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrantAll).not.toHaveBeenCalled();
  });

  it("returns insufficient_scope when the grant is not policy-backed", async () => {
    getGrant.mockResolvedValue(policyGrantRow({ policy_id: null }));
    isPolicyBackedGrant.mockReturnValue(false);

    await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(tryConsumeGrantAll).not.toHaveBeenCalled();
  });

  it("returns insufficient_scope when policy bindings are missing", async () => {
    getGrant.mockResolvedValue(policyGrantRow());
    getBoundGrants.mockReturnValue(null);

    await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(tryConsumeGrantAll).not.toHaveBeenCalled();
  });

  it("returns insufficient_scope for machine actors before access resolution", async () => {
    getGrant.mockResolvedValue(policyGrantRow());

    await expect(
      consumeInjectionGrantAllWithAudit({
        ...baseInput,
        actor: { type: "machine", machineIdentityId: MACHINE },
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(tryConsumeGrantAll).not.toHaveBeenCalled();
  });

  it("denies when effective access lacks runtime_injection:grant_consume", async () => {
    getGrant.mockResolvedValue(policyGrantRow());
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

    await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(tryConsumeGrantAll).not.toHaveBeenCalled();
  });

  it("maps expired consume failures to grant_expired", async () => {
    getGrant.mockResolvedValue(policyGrantRow());
    tryConsumeGrantAll.mockResolvedValue({ ok: false, reason: "expired" });

    await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantExpired,
      message: "injection grant consume denied",
    });

    expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
  });

  it.each(["already_consumed", "not_found", "consume_mode_mismatch"] as const)(
    "maps %s consume failures to grant_denied",
    async (reason) => {
      getGrant.mockResolvedValue(policyGrantRow());
      tryConsumeGrantAll.mockResolvedValue({ ok: false, reason });

      await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
        code: INJECTION_ERROR_CODES.grantDenied,
        message: "injection grant consume denied",
      });

      expect(decryptBoundGrantSecretVersion).not.toHaveBeenCalled();
    },
  );

  it("consumes all policy bindings and returns plaintext handles only", async () => {
    getGrant.mockResolvedValue(policyGrantRow());

    const result = await consumeInjectionGrantAllWithAudit(baseInput);

    expect(getGrant).toHaveBeenCalledWith(ORG, GRANT);
    expect(withTenantScope).toHaveBeenCalledWith(ORG_TENANT_SCOPE, expect.any(Function));
    expect(tryConsumeGrantAll).toHaveBeenCalledWith(ORG, GRANT);
    expect(decryptBoundGrantSecretVersion).toHaveBeenCalledTimes(2);
    expect(result.entries).toEqual([
      {
        secretId: SECRET_A,
        secretVersionId: VERSION_A,
        variableKey: VARIABLE_KEY_A,
        valueUtf8: plaintextA,
      },
      {
        secretId: SECRET_B,
        secretVersionId: VERSION_B,
        variableKey: VARIABLE_KEY_B,
        valueUtf8: plaintextB,
      },
    ]);
    expect(result.auditEventId).toBe("aud_test");
    for (const entry of result.entries) {
      expect(entry.valueUtf8).toBeInstanceOf(PlaintextHandle);
      expect(entry).not.toHaveProperty("value");
    }
  });

  it("records consume-all success audit with request and operation refs when provided", async () => {
    getGrant.mockResolvedValue(policyGrantRow());
    const request = { requestId: "req_test" as never };
    const operation = { operationId: "op_test" as never };

    await consumeInjectionGrantAllWithAudit({
      ...baseInput,
      request,
      operation,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "consume",
        outcome: "success",
        request,
        operation,
        grantId: GRANT,
        deliveredSecretVersionId: VERSION_A,
      }),
    );
  });

  it("omits auditEventId when consume-all success audit returns no id", async () => {
    getGrant.mockResolvedValue(policyGrantRow());
    vi.mocked(recordRuntimeInjectionAudit).mockResolvedValueOnce(undefined);

    const result = await consumeInjectionGrantAllWithAudit(baseInput);

    expect(result.auditEventId).toBeUndefined();
    expect(result.entries).toHaveLength(2);
  });

  it("denies insufficient_scope with org-only audit when grant id does not resolve", async () => {
    getGrant.mockResolvedValue(null);

    await expect(consumeInjectionGrantAllWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
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
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });
});

describe("consumeInjectionGrantAll", () => {
  it("delegates to consumeInjectionGrantAllWithAudit", async () => {
    getGrant.mockResolvedValue(policyGrantRow());

    const result = await consumeInjectionGrantAll(baseInput);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.variableKey).toBe(VARIABLE_KEY_A);
  });
});
