import { AUTHORIZATION_SCOPES, resolveEffectiveAccess } from "@insecur/access";
import { recordRuntimeInjectionAuditInTenantScope } from "@insecur/audit";
import { PlaintextHandle } from "@insecur/crypto";
import {
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
  userId,
  type VariableKey,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeConsumeInjectionGrantAll } from "../src/consume-injection-grant-all.js";
import { decryptBoundGrantSecretVersion } from "../src/decrypt-grant-secret.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SECRET_A = secretId.brand("sec_00000000000000000000000001");
const SECRET_B = secretId.brand("sec_00000000000000000000000002");
const VERSION_A = secretVersionId.brand("sv_00000000000000000000000001");
const VERSION_B = secretVersionId.brand("sv_00000000000000000000000002");
const KEY_A = "SECRET_A" as VariableKey;
const KEY_B = "SECRET_B" as VariableKey;

const { tryConsumeGrantAll, withTenantScope } = vi.hoisted(() => ({
  tryConsumeGrantAll: vi.fn(),
  withTenantScope: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    tryConsumeGrantAll = tryConsumeGrantAll;
  }
  return {
    ...actual,
    TenantInjectionGrantStore: MockTenantInjectionGrantStore,
    withTenantScope,
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return { ...actual, resolveEffectiveAccess: vi.fn() };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordRuntimeInjectionAuditInTenantScope: vi.fn(),
  };
});

vi.mock("../src/decrypt-grant-secret.js", () => ({
  decryptBoundGrantSecretVersion: vi.fn(),
}));

const loaded = {
  projectId: PROJECT,
  environmentId: ENV,
  issuedTo: { type: "user" as const, userId: USER },
  bindings: [
    { secretId: SECRET_A, secretVersionId: VERSION_A, variableKey: KEY_A },
    { secretId: SECRET_B, secretVersionId: VERSION_B, variableKey: KEY_B },
  ],
};

const input = {
  keyring: {} as never,
  organizationId: ORG,
  grantId: GRANT,
  actor: { type: "user" as const, userId: USER },
};

let plaintextA: PlaintextHandle;
let plaintextB: PlaintextHandle;

beforeEach(() => {
  plaintextA = new PlaintextHandle(new TextEncoder().encode("secret-a"));
  plaintextB = new PlaintextHandle(new TextEncoder().encode("secret-b"));
  tryConsumeGrantAll.mockReset();
  tryConsumeGrantAll.mockResolvedValue({ ok: true });
  withTenantScope.mockReset();
  withTenantScope.mockImplementation(async (_scope, callback) => callback({ db: {}, sql: {} }));
  vi.mocked(resolveEffectiveAccess).mockReset();
  vi.mocked(resolveEffectiveAccess).mockResolvedValue({
    scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume],
  });
  vi.mocked(decryptBoundGrantSecretVersion).mockReset();
  vi.mocked(decryptBoundGrantSecretVersion)
    .mockResolvedValueOnce(plaintextA)
    .mockResolvedValueOnce(plaintextB);
  vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockReset();
  vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockResolvedValue({
    auditEventId: "aud_test",
  });
});

describe("executeConsumeInjectionGrantAll", () => {
  it("commits consume-all and its success audit in one tenant transaction", async () => {
    await expect(executeConsumeInjectionGrantAll(input, loaded)).resolves.toMatchObject({
      entries: expect.any(Array),
      auditEventId: "aud_test",
    });

    expect(tryConsumeGrantAll).toHaveBeenCalledWith(ORG, GRANT);
    expect(recordRuntimeInjectionAuditInTenantScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phase: "consume",
        outcome: "success",
        grantId: GRANT,
        deliveredSecretVersionId: VERSION_A,
      }),
    );
    expect(withTenantScope).toHaveBeenCalledTimes(1);
  });

  it("rolls back consume-all and clears every plaintext when success audit insertion fails", async () => {
    let staged = false;
    let committed = false;
    tryConsumeGrantAll.mockImplementation(async () => {
      staged = true;
      return { ok: true };
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

    await expect(executeConsumeInjectionGrantAll(input, loaded)).rejects.toThrow(
      "audit insert failed",
    );

    expect(committed).toBe(false);
    expect(plaintextA.unwrapUtf8()).toEqual(new Uint8Array("secret-a".length));
    expect(plaintextB.unwrapUtf8()).toEqual(new Uint8Array("secret-b".length));
  });
});
