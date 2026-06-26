import {
  AUTHORIZATION_SCOPES,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  brandValue,
  environmentId,
  organizationId,
  projectId,
  userId,
  type VariableKey,
} from "@insecur/domain";
import { encryptSecretValue } from "@insecur/crypto";
import { withTenantScope } from "@insecur/tenant-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertSecretNonProtectedWriteAccess } from "../src/assert-secret-non-protected-write-access.js";
import { SecretWriteError } from "../src/secret-write-error.js";
import { writeAuthorizedNonProtectedSecret } from "../src/write-authorized-non-protected-secret.js";

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
    withTenantScope: vi.fn(),
  };
});

vi.mock("../src/record-secret-write-audit.js", () => ({
  recordSecretWriteAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

vi.mock("../src/validate-text-secret-value.js", () => ({
  validateTextSecretValue: vi.fn(),
}));

import { recordSecretWriteAudit } from "../src/record-secret-write-audit.js";
import { validateTextSecretValue } from "../src/validate-text-secret-value.js";

const encryptMock = vi.mocked(encryptSecretValue);
const withTenantScopeMock = vi.mocked(withTenantScope);
const auditMock = vi.mocked(recordSecretWriteAudit);
const validateValueMock = vi.mocked(validateTextSecretValue);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };
const WRITE_COORDINATE: ResourceCoordinate = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

function effectiveAccessWithWriteScope(organizationIdValue = ORG): EffectiveAccessResult {
  return {
    organizationId: organizationIdValue,
    scopes: [AUTHORIZATION_SCOPES.secretNonProtectedWrite],
  };
}

function baseWriteInput(valueUtf8: Uint8Array) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    variableKey: "API_KEY" as VariableKey,
    actor: ACTOR,
    valueUtf8,
  };
}

describe("assertSecretNonProtectedWriteAccess", () => {
  it("accepts matching coordinate evidence with secret:non_protected_write", () => {
    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(),
        WRITE_COORDINATE,
      ),
    ).not.toThrow();
  });

  it("rejects missing Effective Access evidence", () => {
    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        undefined,
        WRITE_COORDINATE,
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("rejects missing access coordinate evidence", () => {
    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(),
        undefined,
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("rejects unrelated organization evidence", () => {
    const otherOrg = organizationId.brand("org_00000000000000000000000002");

    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(otherOrg),
        { organizationId: otherOrg, projectId: PROJECT, environmentId: ENV },
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("rejects access evidence resolved at a different project", () => {
    const otherProject = projectId.brand("prj_00000000000000000000000002");

    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(),
        { organizationId: ORG, projectId: otherProject, environmentId: ENV },
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("rejects scopes without secret:non_protected_write", () => {
    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        { organizationId: ORG, scopes: [AUTHORIZATION_SCOPES.secretRead] },
        WRITE_COORDINATE,
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("rejects access evidence resolved at a different environment", () => {
    const otherEnvironment = environmentId.brand("env_00000000000000000000000002");

    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(),
        { organizationId: ORG, projectId: PROJECT, environmentId: otherEnvironment },
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("rejects access coordinates missing project or environment scope", () => {
    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(),
        { organizationId: ORG },
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );

    expect(() =>
      assertSecretNonProtectedWriteAccess(
        { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        effectiveAccessWithWriteScope(),
        { organizationId: ORG, projectId: PROJECT },
      ),
    ).toThrow(
      expect.objectContaining({
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });
});

describe("writeAuthorizedNonProtectedSecret", () => {
  beforeEach(() => {
    encryptMock.mockReset();
    withTenantScopeMock.mockReset();
    auditMock.mockClear();
    validateValueMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fails with auth.insufficient_scope before value validation when evidence is missing", async () => {
    const sensitive = new TextEncoder().encode("must-not-validate");

    await expect(
      writeAuthorizedNonProtectedSecret({
        ...baseWriteInput(sensitive),
        effectiveAccess: undefined,
        accessCoordinate: undefined,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
      retryable: false,
    });

    expect(validateValueMock).not.toHaveBeenCalled();
    expect(encryptMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain("must-not-validate");
  });

  it("fails with auth.insufficient_scope before persistence when scope is insufficient", async () => {
    await expect(
      writeAuthorizedNonProtectedSecret({
        ...baseWriteInput(new TextEncoder().encode("secret")),
        effectiveAccess: { organizationId: ORG, scopes: [AUTHORIZATION_SCOPES.secretRead] },
        accessCoordinate: WRITE_COORDINATE,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(validateValueMock).not.toHaveBeenCalled();
    expect(encryptMock).not.toHaveBeenCalled();
  });

  it("fails with auth.insufficient_scope before validation when the access coordinate environment differs", async () => {
    const otherEnvironment = environmentId.brand("env_00000000000000000000000002");
    const sensitive = new TextEncoder().encode("must-not-validate");

    await expect(
      writeAuthorizedNonProtectedSecret({
        ...baseWriteInput(sensitive),
        effectiveAccess: effectiveAccessWithWriteScope(),
        accessCoordinate: {
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: otherEnvironment,
        },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(validateValueMock).not.toHaveBeenCalled();
    expect(encryptMock).not.toHaveBeenCalled();
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain("must-not-validate");
  });

  it("rejects forged invalid Variable Keys only after authorization succeeds", async () => {
    const forgedKey = brandValue<string, "VariableKey">("not-a-valid-key");

    await expect(
      writeAuthorizedNonProtectedSecret({
        ...baseWriteInput(new TextEncoder().encode("secret")),
        variableKey: forgedKey,
        effectiveAccess: effectiveAccessWithWriteScope(),
        accessCoordinate: WRITE_COORDINATE,
      }),
    ).rejects.toMatchObject({ code: VALIDATION_ERROR_CODES.invalidVariableKey });

    expect(encryptMock).not.toHaveBeenCalled();
  });

  it("delegates to writeNonProtectedSecret when authorization succeeds", async () => {
    encryptMock.mockResolvedValue({
      organizationDataKeyVersion: 1,
      projectDataKeyVersion: 1,
      ciphertext: new Uint8Array([1, 2, 3]),
    } as never);
    withTenantScopeMock.mockResolvedValue({
      secretId: "sec_00000000000000000000000001" as never,
      secretVersionId: "sv_00000000000000000000000001" as never,
      createdSecretShape: true,
    });

    const result = await writeAuthorizedNonProtectedSecret({
      ...baseWriteInput(new TextEncoder().encode("authorized-secret")),
      effectiveAccess: effectiveAccessWithWriteScope(),
      accessCoordinate: WRITE_COORDINATE,
    });

    expect(result.createdSecretShape).toBe(true);
    expect(validateValueMock).toHaveBeenCalled();
    expect(withTenantScopeMock).toHaveBeenCalled();
  });

  it("throws SecretWriteError compatible with ErrorBody on auth failure", async () => {
    const sensitive = new TextEncoder().encode("do-not-leak-value");

    try {
      await writeAuthorizedNonProtectedSecret({
        ...baseWriteInput(sensitive),
        effectiveAccess: undefined,
        accessCoordinate: WRITE_COORDINATE,
      });
      expect.fail("expected auth failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretWriteError);
      expect(error).toMatchObject({
        code: AUTH_ERROR_CODES.insufficientScope,
        retryable: false,
      });
      expect(String(error)).not.toContain(new TextDecoder().decode(sensitive));
    }
  });
});
