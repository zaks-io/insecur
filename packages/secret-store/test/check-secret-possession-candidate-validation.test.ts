import { createKeyring, decryptSecretValueForRuntime } from "@insecur/crypto";
import {
  ENVIRONMENT_ERROR_CODES,
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SECRET_VALUE_SIZE_LIMIT_BYTES } from "../src/constants.js";
import { checkSecretPossession } from "../src/check-secret-possession.js";
import {
  recordDeniedPossessionCheckAudit,
  recordPossessionCheckedAudit,
} from "../src/record-possession-check-audit.js";

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
    withTenantScope: vi.fn(),
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
const tenantScopeMock = vi.mocked(withTenantScope);
const deniedAuditMock = vi.mocked(recordDeniedPossessionCheckAudit);
const checkedAuditMock = vi.mocked(recordPossessionCheckedAudit);

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

function possessionInput(candidateUtf8: Uint8Array) {
  return {
    keyring: TEST_KEYRING,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    variableKey: "API_KEY",
    candidateUtf8,
    actor: ACTOR,
    request: { requestId: "req_test" as never },
  };
}

describe("checkSecretPossession candidate value contract (INS-528)", () => {
  beforeEach(() => {
    decryptMock.mockReset();
    tenantScopeMock.mockReset();
    deniedAuditMock.mockClear();
    checkedAuditMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubMissingEnvironmentScope() {
    tenantScopeMock.mockImplementation(async (_scope, callback) => callback({ db: {} } as never));
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue(null);
  }

  it("rejects an oversized candidate with the write path's stable value_too_large code before any storage read", async () => {
    const oversized = new Uint8Array(SECRET_VALUE_SIZE_LIMIT_BYTES + 1).fill(0x61);

    await expect(checkSecretPossession(possessionInput(oversized))).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.valueTooLarge,
    });

    expect(tenantScopeMock).not.toHaveBeenCalled();
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("records a metadata-only denied audit for an oversized candidate (no value, no length detail)", async () => {
    const oversized = new Uint8Array(SECRET_VALUE_SIZE_LIMIT_BYTES + 1).fill(0x61);

    await expect(checkSecretPossession(possessionInput(oversized))).rejects.toThrow();

    expect(deniedAuditMock).toHaveBeenCalledWith({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      reasonCode: SECRET_ERROR_CODES.valueTooLarge,
      request: { requestId: "req_test" },
    });
    expect(checkedAuditMock).not.toHaveBeenCalled();
  });

  it("rejects a candidate that is not valid UTF-8 with the write path's stable code", async () => {
    const invalid = new Uint8Array([0xff, 0xfe, 0xfd]);

    await expect(checkSecretPossession(possessionInput(invalid))).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidEncoding,
    });
    expect(tenantScopeMock).not.toHaveBeenCalled();
  });

  it("lets an at-limit candidate through validation into coordinate resolution", async () => {
    // The environment lookup rejects (mocked scope has no environment), proving the size gate
    // passed: an at-limit candidate must never trip value_too_large.
    stubMissingEnvironmentScope();
    const atLimit = new Uint8Array(SECRET_VALUE_SIZE_LIMIT_BYTES).fill(0x61);

    await expect(checkSecretPossession(possessionInput(atLimit))).rejects.toMatchObject({
      code: ENVIRONMENT_ERROR_CODES.notFound,
    });
  });

  it("lets an empty candidate through validation so empty stored values stay checkable", async () => {
    stubMissingEnvironmentScope();

    await expect(checkSecretPossession(possessionInput(new Uint8Array(0)))).rejects.toMatchObject({
      code: ENVIRONMENT_ERROR_CODES.notFound,
    });
  });
});
