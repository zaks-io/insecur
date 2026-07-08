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

describe("resolveSecretSync access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants read access when sync:read is present", async () => {
    accessMocks.resolveEffectiveAccess.mockResolvedValue({
      organizationId: ORG,
      scopes: ["sync:read"],
    } as never);

    await expect(resolveSecretSyncReadAccess(ACTOR, COORDINATE)).resolves.toBeDefined();
    await expect(
      resolveSecretSyncProjectReadAccess(ACTOR, { organizationId: ORG, projectId: PROJECT }),
    ).resolves.toBeDefined();
  });

  it("requires manage scope for mutations", async () => {
    accessMocks.resolveEffectiveAccess.mockResolvedValue({
      organizationId: ORG,
      scopes: ["sync:manage"],
    } as never);

    await expect(resolveSecretSyncManageAccess(ACTOR, COORDINATE)).resolves.toBeDefined();
  });

  it("requires run scope for execution", async () => {
    accessMocks.resolveEffectiveAccess.mockResolvedValue({
      organizationId: ORG,
      scopes: ["sync:run"],
    } as never);

    await expect(resolveSecretSyncRunAccess(ACTOR, COORDINATE)).resolves.toBeDefined();
  });

  it("rejects missing scopes", async () => {
    accessMocks.resolveEffectiveAccess.mockResolvedValue({
      organizationId: ORG,
      scopes: [],
    } as never);

    await expect(resolveSecretSyncManageAccess(ACTOR, COORDINATE)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    } as SecretSyncError);
  });
});
