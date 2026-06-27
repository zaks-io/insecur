import {
  INJECTION_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getVersionById, decryptSecretValueForRuntime, withTenantScope } = vi.hoisted(() => ({
  getVersionById: vi.fn(),
  decryptSecretValueForRuntime: vi.fn(),
  withTenantScope: vi.fn(async (_scope: unknown, fn: (ctx: { db: unknown }) => Promise<unknown>) =>
    fn({ db: {} }),
  ),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantSecretVersionStore {
    getVersionById = getVersionById;
  }
  return {
    ...actual,
    withTenantScope,
    TenantSecretVersionStore: MockTenantSecretVersionStore,
  };
});

vi.mock("@insecur/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/crypto")>();
  return {
    ...actual,
    decryptSecretValueForRuntime,
  };
});

import { PlaintextHandle } from "@insecur/crypto";
import { decryptBoundGrantSecretVersion } from "../src/decrypt-grant-secret.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");

const ORG_TENANT_SCOPE = { kind: "organization" as const, organizationId: ORG };

const baseInput = {
  keyring: {} as never,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  secretId: SECRET,
  secretVersionId: SECRET_VERSION,
};

beforeEach(() => {
  getVersionById.mockReset();
  decryptSecretValueForRuntime.mockReset();
  withTenantScope.mockClear();
});

describe("decryptBoundGrantSecretVersion", () => {
  it("denies when the bound secret version row is missing", async () => {
    getVersionById.mockResolvedValue(null);

    await expect(decryptBoundGrantSecretVersion(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
      message: "bound secret version not found",
    });

    expect(withTenantScope).toHaveBeenCalledWith(ORG_TENANT_SCOPE, expect.any(Function));
    expect(decryptSecretValueForRuntime).not.toHaveBeenCalled();
  });

  it("decrypts the bound secret version through the runtime keyring seam", async () => {
    const wrapped = { ciphertext: "cipher", metadata: {} };
    const plaintext = new PlaintextHandle(new TextEncoder().encode("decrypted"));
    getVersionById.mockResolvedValue({ wrapped });
    decryptSecretValueForRuntime.mockResolvedValue(plaintext);

    const result = await decryptBoundGrantSecretVersion(baseInput);

    expect(withTenantScope).toHaveBeenCalledWith(ORG_TENANT_SCOPE, expect.any(Function));
    expect(getVersionById).toHaveBeenCalledWith(SECRET, SECRET_VERSION);
    expect(decryptSecretValueForRuntime).toHaveBeenCalledWith(
      baseInput.keyring,
      {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretId: SECRET,
      },
      wrapped,
    );
    expect(result).toBe(plaintext);
  });
});
