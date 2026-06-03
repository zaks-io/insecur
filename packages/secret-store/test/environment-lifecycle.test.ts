import { environmentId, organizationId, projectId } from "@insecur/domain";
import { testDisplayName } from "./test-display-name.js";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTHORIZATION_SCOPES, EnvironmentLifecycleAccessError } from "@insecur/access";

import {
  getEnvironmentLifecycle,
  updateAuthorizedEnvironmentLifecycle,
} from "../src/environment-lifecycle.js";

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, callback) => callback({})),
  };
});

const withTenantScopeMock = vi.mocked(withTenantScope);

const ORG = organizationId.brand("org_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

const LIFECYCLE_ROW = {
  environmentId: ENV,
  organizationId: ORG,
  projectId: projectId.brand("prj_00000000000000000000000001"),
  displayName: testDisplayName("Development"),
  lifecycleStage: "development" as const,
  isProtected: false,
  previewNonProductionOptDown: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

afterEach(() => {
  withTenantScopeMock.mockClear();
  vi.restoreAllMocks();
});

describe("getEnvironmentLifecycle", () => {
  it("delegates to the tenant environment lifecycle store", async () => {
    const getById = vi
      .spyOn(TenantEnvironmentLifecycleStore.prototype, "getById")
      .mockResolvedValue(LIFECYCLE_ROW);

    const row = await getEnvironmentLifecycle({
      organizationId: ORG,
      environmentId: ENV,
    });

    expect(row).toEqual(LIFECYCLE_ROW);
    expect(getById).toHaveBeenCalledWith(ORG, ENV);
    expect(withTenantScopeMock).toHaveBeenCalled();
  });
});

describe("updateAuthorizedEnvironmentLifecycle", () => {
  it("delegates display name updates after access validation", async () => {
    const updateDisplayName = vi
      .spyOn(TenantEnvironmentLifecycleStore.prototype, "updateDisplayName")
      .mockResolvedValue({
        ...LIFECYCLE_ROW,
        displayName: testDisplayName("Renamed"),
      });

    const updated = await updateAuthorizedEnvironmentLifecycle({
      organizationId: ORG,
      projectId: LIFECYCLE_ROW.projectId,
      environmentId: ENV,
      displayName: testDisplayName("Renamed"),
      effectiveAccess: {
        organizationId: ORG,
        scopes: [AUTHORIZATION_SCOPES.projectConfigure],
      },
      accessCoordinate: {
        organizationId: ORG,
        projectId: LIFECYCLE_ROW.projectId,
        environmentId: ENV,
      },
    });

    expect(updated.displayName).toBe("Renamed");
    expect(updateDisplayName).toHaveBeenCalled();
  });

  it("rejects lifecycle updates without project:configure", async () => {
    await expect(
      updateAuthorizedEnvironmentLifecycle({
        organizationId: ORG,
        projectId: LIFECYCLE_ROW.projectId,
        environmentId: ENV,
        displayName: testDisplayName("Renamed"),
        effectiveAccess: { organizationId: ORG, scopes: [] },
        accessCoordinate: {
          organizationId: ORG,
          projectId: LIFECYCLE_ROW.projectId,
          environmentId: ENV,
        },
      }),
    ).rejects.toBeInstanceOf(EnvironmentLifecycleAccessError);
  });
});
