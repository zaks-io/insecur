import { environmentId, organizationId, projectId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn(),
  TenantHierarchyDisplayNameStore: vi.fn(),
  TenantEnvironmentLifecycleStore: vi.fn(),
}));

import {
  TenantEnvironmentLifecycleStore,
  TenantHierarchyDisplayNameStore,
  withTenantScope,
} from "@insecur/tenant-store";
import { resolveEnvelopeDisplayNames } from "../src/resolve-envelope-display-names.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("resolveEnvelopeDisplayNames", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves hierarchy display names with opaque-id fallbacks", async () => {
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) => run({ db: {} } as never));
    vi.mocked(TenantHierarchyDisplayNameStore).mockImplementation(
      class {
        getOrganizationDisplayName = vi.fn().mockResolvedValue("Acme");
        getProjectDisplayName = vi.fn().mockResolvedValue(null);
      } as never,
    );
    vi.mocked(TenantEnvironmentLifecycleStore).mockImplementation(
      class {
        getById = vi.fn().mockResolvedValue({ displayName: "Production" });
      } as never,
    );

    await expect(
      resolveEnvelopeDisplayNames({
        eventCode: "secret.non_protected_write",
        outcome: "success",
        actor: { type: "user", userId: "usr_00000000000000000000000001" },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).resolves.toEqual({
      organization: "Acme",
      project: PROJECT,
      environment: "Production",
    });
  });
});
