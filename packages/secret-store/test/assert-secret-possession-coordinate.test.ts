import {
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
  userId,
} from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
  withTenantScope,
} from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertSecretPossessionCoordinate } from "../src/assert-secret-possession-coordinate.js";
import { SecretWriteError } from "../src/secret-write-error.js";

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  const withTenantScope = vi.fn(async (_scope, fn) => fn({ db: {} }));
  const assertProjectEnvironmentCoordinate = vi.fn();
  return {
    ...actual,
    withTenantScope,
    assertProjectEnvironmentCoordinate,
    assertProjectEnvironmentCoordinateWithScope: vi.fn(async (options) => {
      try {
        return await withTenantScope(
          { kind: "organization", organizationId: options.coordinate.organizationId },
          ({ db }) => assertProjectEnvironmentCoordinate(db, options.coordinate),
        );
      } catch (error) {
        if (error instanceof actual.ProjectEnvironmentCoordinateError) {
          await options.onCoordinateDenied?.().catch(() => undefined);
          throw options.createCoordinateError();
        }
        throw error;
      }
    }),
  };
});

vi.mock("../src/record-possession-check-audit.js", () => ({
  recordDeniedPossessionCheckAudit: vi.fn().mockResolvedValue(undefined),
}));

import { recordDeniedPossessionCheckAudit } from "../src/record-possession-check-audit.js";

const assertCoordinateMock = vi.mocked(assertProjectEnvironmentCoordinate);
const withTenantScopeMock = vi.mocked(withTenantScope);
const auditMock = vi.mocked(recordDeniedPossessionCheckAudit);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const ENV_OWNED_BY_B = environmentId.brand("env_00000000000000000000000009");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

const INPUT = {
  organizationId: ORG,
  projectId: PROJECT_A,
  environmentId: ENV_OWNED_BY_B,
  actor: ACTOR,
  request: { requestId: "req_test" as never },
};

beforeEach(() => {
  assertCoordinateMock.mockReset();
  withTenantScopeMock.mockClear();
  auditMock.mockClear();
});

describe("assertSecretPossessionCoordinate (INS-528)", () => {
  it("passes through the environment protection when the coordinate is owned by the URL project", async () => {
    assertCoordinateMock.mockResolvedValue({ isProtected: false });

    await expect(assertSecretPossessionCoordinate(INPUT)).resolves.toEqual({ isProtected: false });
    expect(withTenantScopeMock).toHaveBeenCalledWith(
      { kind: "organization", organizationId: ORG },
      expect.any(Function),
    );
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects with the same secret.coordinate_invalid collapse as the write path (no existence oracle)", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment does not belong to project"),
    );

    await expect(assertSecretPossessionCoordinate(INPUT)).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.coordinateInvalid,
    });
    await expect(assertSecretPossessionCoordinate(INPUT)).rejects.toBeInstanceOf(SecretWriteError);
  });

  it("audits the denial through the possession-specific denied recorder, not the write recorder", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment does not belong to project"),
    );

    await expect(
      assertSecretPossessionCoordinate({ ...INPUT, secretId: SECRET }),
    ).rejects.toThrow();
    expect(auditMock).toHaveBeenCalledWith({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT_A,
      environmentId: ENV_OWNED_BY_B,
      secretId: SECRET,
      reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
      request: INPUT.request,
    });
  });

  it("omits secretId from the denied audit when the probe targets by variable key only", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment not found"),
    );

    await expect(assertSecretPossessionCoordinate(INPUT)).rejects.toThrow();
    expect(auditMock).toHaveBeenCalledWith({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT_A,
      environmentId: ENV_OWNED_BY_B,
      reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
      request: INPUT.request,
    });
  });

  it("does not translate or audit unexpected errors", async () => {
    assertCoordinateMock.mockRejectedValue(new Error("db connection lost"));

    await expect(assertSecretPossessionCoordinate(INPUT)).rejects.toThrow("db connection lost");
    expect(auditMock).not.toHaveBeenCalled();
  });
});
