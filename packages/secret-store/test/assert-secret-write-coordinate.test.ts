import { SECRET_ERROR_CODES, environmentId, organizationId, projectId } from "@insecur/domain";
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
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, fn) => fn({ db: {} })),
    assertProjectEnvironmentCoordinate: vi.fn(),
  };
});

const assertCoordinateMock = vi.mocked(assertProjectEnvironmentCoordinate);
const withTenantScopeMock = vi.mocked(withTenantScope);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const ENV_OWNED_BY_B = environmentId.brand("env_00000000000000000000000009");

const COORDINATE = { organizationId: ORG, projectId: PROJECT_A, environmentId: ENV_OWNED_BY_B };

beforeEach(() => {
  assertCoordinateMock.mockReset();
  withTenantScopeMock.mockClear();
});

describe("assertSecretWriteCoordinate (INS-154)", () => {
  it("passes through the environment protection when the coordinate is owned by the URL project", async () => {
    assertCoordinateMock.mockResolvedValue({ isProtected: false });

    await expect(assertSecretWriteCoordinate(COORDINATE)).resolves.toEqual({ isProtected: false });
    expect(withTenantScopeMock).toHaveBeenCalledWith(
      { kind: "organization", organizationId: ORG },
      expect.any(Function),
    );
  });

  it("rejects with secret.coordinate_invalid when the environment is not owned by the URL project", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment does not belong to project"),
    );

    await expect(assertSecretWriteCoordinate(COORDINATE)).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.coordinateInvalid,
    });
    await expect(assertSecretWriteCoordinate(COORDINATE)).rejects.toBeInstanceOf(SecretWriteError);
  });

  it("collapses environment-not-found into the same secret.coordinate_invalid code (no existence oracle)", async () => {
    assertCoordinateMock.mockRejectedValue(
      new ProjectEnvironmentCoordinateError("environment not found"),
    );

    await expect(assertSecretWriteCoordinate(COORDINATE)).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.coordinateInvalid,
    });
  });

  it("does not translate unexpected errors", async () => {
    assertCoordinateMock.mockRejectedValue(new Error("db connection lost"));

    await expect(assertSecretWriteCoordinate(COORDINATE)).rejects.toThrow("db connection lost");
  });
});
