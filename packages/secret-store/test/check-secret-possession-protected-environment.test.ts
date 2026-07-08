import { createKeyring, decryptSecretValueForRuntime } from "@insecur/crypto";
import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { TenantEnvironmentLifecycleStore } from "@insecur/tenant-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkSecretPossession } from "../src/check-secret-possession.js";
import { testDisplayName } from "./test-display-name.js";

vi.mock("@insecur/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/crypto")>();
  return {
    ...actual,
    decryptSecretValueForRuntime: vi.fn(),
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, callback) => callback({ db: {} })),
  };
});

vi.mock("../src/record-possession-check-audit.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/record-possession-check-audit.js")>();
  return {
    ...actual,
    recordPossessionCheckedAudit: vi.fn(async () => ({ auditEventId: "aud_test" })),
    recordDeniedPossessionCheckAudit: vi.fn(async () => undefined),
  };
});

const decryptMock = vi.mocked(decryptSecretValueForRuntime);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

const TEST_KEYRING = createKeyring(createTestRootKey());

const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

describe("checkSecretPossession protected environment guard", () => {
  beforeEach(() => {
    decryptMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed with protected_environment before any decrypt when the target is Protected", async () => {
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
      checkSecretPossession({
        keyring: TEST_KEYRING,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKey: "API_KEY",
        candidateUtf8: new TextEncoder().encode("candidate"),
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: ENVIRONMENT_ERROR_CODES.protectedEnvironment });

    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("collapses a missing environment to the resource-shaped coordinate_invalid denial", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue(null);

    await expect(
      checkSecretPossession({
        keyring: TEST_KEYRING,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKey: "API_KEY",
        candidateUtf8: new TextEncoder().encode("candidate"),
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: ENVIRONMENT_ERROR_CODES.notFound });

    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("exposes the coordinate_invalid stable code for callers", () => {
    // Guards against drift: the not-found collapse code must remain a stable dotted code.
    expect(SECRET_ERROR_CODES.coordinateInvalid).toBe("secret.coordinate_invalid");
  });
});
