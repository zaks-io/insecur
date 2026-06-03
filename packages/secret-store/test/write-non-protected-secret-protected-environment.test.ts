import {
  configureKeyring,
  createKeyring,
  encryptSecretValue,
  resetKeyringForTests,
} from "@insecur/crypto";
import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { TenantEnvironmentLifecycleStore } from "@insecur/tenant-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretWriteError } from "../src/secret-write-error.js";
import { testDisplayName } from "./test-display-name.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";

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
    withTenantScope: vi.fn(async (_scope, callback) => callback({})),
  };
});

const encryptMock = vi.mocked(encryptSecretValue);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

describe("writeNonProtectedSecret protected environment guard", () => {
  beforeEach(() => {
    resetKeyringForTests();
    configureKeyring(createKeyring(createTestRootKey()));
    encryptMock.mockReset();
  });

  afterEach(() => {
    resetKeyringForTests();
    vi.restoreAllMocks();
  });

  it("fails closed before encryption when the environment is protected", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue({
      environmentId: ENV,
      organizationId: ORG,
      projectId: PROJECT,
      displayName: testDisplayName("Preview"),
      lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
      isProtected: true,
      previewNonProductionOptDown: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    await expect(
      writeNonProtectedSecret({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKey: "API_KEY",
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        valueUtf8: new TextEncoder().encode("secret-value"),
      }),
    ).rejects.toMatchObject({
      code: ENVIRONMENT_ERROR_CODES.protectedEnvironment,
    });

    expect(encryptMock).not.toHaveBeenCalled();
  });

  it("surfaces not-found when lifecycle metadata is missing", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue(null);

    await expect(
      writeNonProtectedSecret({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKey: "API_KEY",
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        valueUtf8: new TextEncoder().encode("secret-value"),
      }),
    ).rejects.toBeInstanceOf(SecretWriteError);

    expect(encryptMock).not.toHaveBeenCalled();
  });
});
