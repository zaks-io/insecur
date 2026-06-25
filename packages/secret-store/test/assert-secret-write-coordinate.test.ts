import {
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
  withTenantScope,
} from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertSecretWriteCoordinate } from "../src/assert-secret-write-coordinate.js";
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

vi.mock("../src/record-secret-write-audit.js", () => ({
  recordSecretWriteAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

import { recordSecretWriteAudit } from "../src/record-secret-write-audit.js";

const assertCoordinateMock = vi.mocked(assertProjectEnvironmentCoordinate);
const withTenantScopeMock = vi.mocked(withTenantScope);
const auditMock = vi.mocked(recordSecretWriteAudit);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const ENV_OWNED_BY_B = environmentId.brand("env_00000000000000000000000009");
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

describe("assertSecretWriteCoordinate (INS-154)", () => {
  it("passes through the environment protection when the coordinate is owned by the URL project", async () => {
    assertCoordinateMock.mockResolvedValue({ isProtected: false });

    await expect(assertSecretWriteCoordinate(INPUT)).resolves.toEqual({ isProtected: false });
    expect(withTenantScopeMock).toHaveBeenCalledWith(
      { kind: "organization", organizationId: ORG },
      expect.any(Function),
    );
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects with secret.coordinate_invalid when the environment is not owned by the URL project", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment does not belong to project"),
    );

    await expect(assertSecretWriteCoordinate(INPUT)).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.coordinateInvalid,
    });
    await expect(assertSecretWriteCoordinate(INPUT)).rejects.toBeInstanceOf(SecretWriteError);
  });

  it("collapses environment-not-found into the same secret.coordinate_invalid code (no existence oracle)", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment not found"),
    );

    await expect(assertSecretWriteCoordinate(INPUT)).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.coordinateInvalid,
    });
  });

  it("records a denied-write audit on coordinate rejection (cross-project probe detection)", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment does not belong to project"),
    );

    await expect(assertSecretWriteCoordinate(INPUT)).rejects.toThrow();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT_A,
        environmentId: ENV_OWNED_BY_B,
        reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
      }),
    );
  });

  it("does not translate or audit unexpected errors", async () => {
    assertCoordinateMock.mockRejectedValue(new Error("db connection lost"));

    await expect(assertSecretWriteCoordinate(INPUT)).rejects.toThrow("db connection lost");
    expect(auditMock).not.toHaveBeenCalled();
  });
});
