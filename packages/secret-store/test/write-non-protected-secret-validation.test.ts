import { createKeyring, encryptSecretValue, toStoreFacingCiphertext } from "@insecur/crypto";
import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SECRET_VALUE_SIZE_LIMIT_BYTES } from "../src/constants.js";
import { SecretWriteError } from "../src/secret-write-error.js";
import { testDisplayName } from "./test-display-name.js";
import {
  toStoredWrappedSecretMaterial,
  writeNonProtectedSecret,
} from "../src/write-non-protected-secret.js";

vi.mock("@insecur/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/crypto")>();
  return {
    ...actual,
    encryptSecretValue: vi.fn(),
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, callback) => callback({ db: {} })),
  };
});

vi.mock("../src/record-secret-storage-write-audit.js", () => ({
  recordSecretStorageWriteAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  recordDeniedSecretStorageWriteAudit: vi.fn().mockResolvedValue(undefined),
}));

import {
  recordDeniedSecretStorageWriteAudit,
  recordSecretStorageWriteAudit,
} from "../src/record-secret-storage-write-audit.js";

const encryptMock = vi.mocked(encryptSecretValue);
const withTenantScopeMock = vi.mocked(withTenantScope);
const auditMock = vi.mocked(recordSecretStorageWriteAudit);
const deniedAuditMock = vi.mocked(recordDeniedSecretStorageWriteAudit);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

const TEST_KEYRING = createKeyring(createTestRootKey());

function baseWriteInput(valueUtf8: Uint8Array, allowEmpty?: boolean) {
  return {
    keyring: TEST_KEYRING,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    variableKey: "API_KEY" as const,
    actor: ACTOR,
    valueUtf8,
    ...(allowEmpty === true ? { allowEmpty: true } : {}),
  };
}

function mockWritableEnvironment(): void {
  vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue({
    environmentId: ENV,
    organizationId: ORG,
    projectId: PROJECT,
    displayName: testDisplayName("Development"),
    lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.development,
    isProtected: false,
    previewNonProductionOptDown: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
  });
}

function mockResolveSecretForWrite(): void {
  vi.spyOn(TenantSecretVersionStore.prototype, "resolveSecretForWrite").mockResolvedValue({
    secretId: "sec_00000000000000000000000001" as never,
    createdSecretShape: true,
  });
  vi.spyOn(TenantSecretVersionStore.prototype, "appendVersionAndMakeLive").mockResolvedValue({
    secretId: "sec_00000000000000000000000001" as never,
    secretVersionId: "sv_00000000000000000000000001" as never,
    createdSecretShape: true,
  });
}

describe("toStoredWrappedSecretMaterial", () => {
  it("maps wrapped ciphertext without echoing plaintext identity fields", () => {
    const wrapped = {
      organizationDataKeyVersion: 2,
      projectDataKeyVersion: 3,
      ciphertext: new Uint8Array([9, 8, 7]),
    };

    expect(toStoredWrappedSecretMaterial(wrapped)).toEqual({
      organizationDataKeyVersion: 2,
      projectDataKeyVersion: 3,
      ciphertext: toStoreFacingCiphertext(wrapped),
    });
    expect(JSON.stringify(toStoredWrappedSecretMaterial(wrapped))).not.toMatch(
      /plaintext|valueUtf8/i,
    );
  });
});

describe("writeNonProtectedSecret validation and ingress guards", () => {
  beforeEach(() => {
    encryptMock.mockReset();
    withTenantScopeMock.mockImplementation(async (_scope, callback) => callback({ db: {} }));
    auditMock.mockClear();
    deniedAuditMock.mockClear();
    mockWritableEnvironment();
    mockResolveSecretForWrite();
    encryptMock.mockResolvedValue({
      organizationDataKeyVersion: 1,
      projectDataKeyVersion: 1,
      ciphertext: new Uint8Array([1, 2, 3]),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid UTF-8 before encryption and records a denied audit", async () => {
    const invalid = Uint8Array.from([0xc2]);

    await expect(writeNonProtectedSecret(baseWriteInput(invalid))).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidEncoding,
    });

    expect(encryptMock).not.toHaveBeenCalled();
    expect(deniedAuditMock).toHaveBeenCalledWith({
      kind: "non_protected",
      actor: ACTOR,
      scope: [ORG, PROJECT, ENV],
      refs: [undefined, undefined, undefined],
      reasonCode: SECRET_ERROR_CODES.invalidEncoding,
    });
    expect(JSON.stringify(deniedAuditMock.mock.calls)).not.toContain("c2");
  });

  it("rejects oversized UTF-8 before encryption", async () => {
    const oversized = new Uint8Array(SECRET_VALUE_SIZE_LIMIT_BYTES + 1);
    oversized.fill(0x61);

    await expect(writeNonProtectedSecret(baseWriteInput(oversized))).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.valueTooLarge,
    });

    expect(encryptMock).not.toHaveBeenCalled();
    expect(deniedAuditMock).toHaveBeenCalledWith({
      kind: "non_protected",
      actor: ACTOR,
      scope: [ORG, PROJECT, ENV],
      refs: [undefined, undefined, undefined],
      reasonCode: SECRET_ERROR_CODES.valueTooLarge,
    });
  });

  it("rejects implicit empty values unless allowEmpty is set", async () => {
    await expect(writeNonProtectedSecret(baseWriteInput(new Uint8Array(0)))).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.emptyValue,
    });
    expect(encryptMock).not.toHaveBeenCalled();

    const result = await writeNonProtectedSecret(baseWriteInput(new Uint8Array(0), true));
    expect(result.secretId).toMatch(/^sec_/);
    expect(encryptMock).toHaveBeenCalled();
  });

  it("encrypts outside tenant-scoped DB transactions", async () => {
    const events: string[] = [];
    withTenantScopeMock.mockImplementation(async (_scope, callback) => {
      events.push("scope:start");
      try {
        return await callback({ db: {} });
      } finally {
        events.push("scope:end");
      }
    });
    encryptMock.mockImplementation(async () => {
      events.push("encrypt");
      return {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 1,
        ciphertext: new Uint8Array([1, 2, 3]),
      } as never;
    });

    await writeNonProtectedSecret(baseWriteInput(new TextEncoder().encode("secret-value")));

    expect(events).toEqual(["scope:start", "scope:end", "encrypt", "scope:start", "scope:end"]);
  });

  it("records denied audit for protected environment failures without leaking value bytes", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue({
      environmentId: ENV,
      organizationId: ORG,
      projectId: PROJECT,
      displayName: testDisplayName("Protected"),
      lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
      isProtected: true,
      previewNonProductionOptDown: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const sensitive = new TextEncoder().encode("ingress-bytes");

    await expect(writeNonProtectedSecret(baseWriteInput(sensitive))).rejects.toMatchObject({
      code: ENVIRONMENT_ERROR_CODES.protectedEnvironment,
    });

    expect(encryptMock).not.toHaveBeenCalled();
    expect(deniedAuditMock).toHaveBeenCalledWith({
      kind: "non_protected",
      actor: ACTOR,
      scope: [ORG, PROJECT, ENV],
      refs: [undefined, undefined, undefined],
      reasonCode: ENVIRONMENT_ERROR_CODES.protectedEnvironment,
    });
    expect(JSON.stringify(deniedAuditMock.mock.calls)).not.toContain("ingress-bytes");
  });

  it("throws SecretWriteError without echoing rejected secret bytes", async () => {
    const sensitive = new TextEncoder().encode("do-not-leak-value");
    const invalid = Uint8Array.from([0xff, ...sensitive]);

    try {
      await writeNonProtectedSecret(baseWriteInput(invalid));
      expect.fail("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretWriteError);
      expect(String(error)).not.toContain(new TextDecoder().decode(sensitive));
    }
  });
});
