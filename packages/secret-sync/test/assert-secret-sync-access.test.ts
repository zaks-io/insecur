import { AUTH_ERROR_CODES } from "@insecur/domain";
import { organizationId, projectId, environmentId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  resolveEffectiveAccess: vi.fn(),
}));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: accessMocks.resolveEffectiveAccess,
  };
});

import {
  resolveSecretSyncManageAccess,
  resolveSecretSyncProjectReadAccess,
  resolveSecretSyncReadAccess,
  resolveSecretSyncRunAccess,
} from "../src/assert-secret-sync-access.js";
import { SecretSyncError } from "../src/secret-sync-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const COORDINATE = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };
const PROJECT_COORDINATE = { organizationId: ORG, projectId: PROJECT };

describe("resolveSecretSync access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants read access when sync:read is present", async () => {
    const access = {
      organizationId: ORG,
      scopes: ["sync:read"],
    };
    accessMocks.resolveEffectiveAccess.mockResolvedValue(access as never);

    await expect(resolveSecretSyncReadAccess(ACTOR, COORDINATE)).resolves.toBe(access);
    await expect(resolveSecretSyncProjectReadAccess(ACTOR, PROJECT_COORDINATE)).resolves.toBe(
      access,
    );
    expect(accessMocks.resolveEffectiveAccess).toHaveBeenNthCalledWith(1, ACTOR, COORDINATE);
    expect(accessMocks.resolveEffectiveAccess).toHaveBeenNthCalledWith(
      2,
      ACTOR,
      PROJECT_COORDINATE,
    );
  });

  it("requires manage scope for mutations", async () => {
    const access = {
      organizationId: ORG,
      scopes: ["sync:manage"],
    };
    accessMocks.resolveEffectiveAccess.mockResolvedValue(access as never);

    await expect(resolveSecretSyncManageAccess(ACTOR, COORDINATE)).resolves.toBe(access);
    expect(accessMocks.resolveEffectiveAccess).toHaveBeenCalledWith(ACTOR, COORDINATE);
  });

  it("requires run scope for execution", async () => {
    const access = {
      organizationId: ORG,
      scopes: ["sync:run"],
    };
    accessMocks.resolveEffectiveAccess.mockResolvedValue(access as never);

    await expect(resolveSecretSyncRunAccess(ACTOR, COORDINATE)).resolves.toBe(access);
    expect(accessMocks.resolveEffectiveAccess).toHaveBeenCalledWith(ACTOR, COORDINATE);
  });

  it.each([
    {
      name: "missing scope",
      access: {
        organizationId: ORG,
        scopes: [],
      },
    },
    {
      name: "wrong organization",
      access: {
        organizationId: organizationId.brand("org_00000000000000000000000002"),
        scopes: ["sync:manage"],
      },
    },
  ])("rejects $name", async ({ access }) => {
    accessMocks.resolveEffectiveAccess.mockResolvedValue(access as never);

    await expect(resolveSecretSyncManageAccess(ACTOR, COORDINATE)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
      message: "secret sync manage scope required",
    } as SecretSyncError);
  });
});
