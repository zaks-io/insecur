import { APPROVAL_ERROR_CODES, organizationId, secretId, secretVersionId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

const { getVersionInOrganization } = vi.hoisted(() => ({
  getVersionInOrganization: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  SECRET_VERSION_LIFECYCLE_STATES: {
    draft: "draft",
  },
  TenantSecretVersionStore: vi.fn(function MockStore(this: {
    getVersionInOrganization: typeof getVersionInOrganization;
  }) {
    this.getVersionInOrganization = getVersionInOrganization;
  }),
  withTenantScope: vi.fn(async (_scope, callback) => callback({ db: {} })),
}));

import { validatePromotionDraftTargets } from "../src/validate-promotion-draft-targets.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const DRAFT = secretVersionId.brand("sv_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");

describe("validatePromotionDraftTargets", () => {
  it("rejects non-draft versions", async () => {
    getVersionInOrganization.mockResolvedValue({
      secretId: SECRET,
      lifecycleState: "live",
    });

    await expect(
      validatePromotionDraftTargets({
        organizationId: ORG,
        draftVersionIds: [DRAFT],
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.invalidDraftSelection });
  });

  it("rejects missing draft versions", async () => {
    getVersionInOrganization.mockResolvedValue(null);

    await expect(
      validatePromotionDraftTargets({
        organizationId: ORG,
        draftVersionIds: [DRAFT],
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.invalidDraftSelection });
  });

  it("returns secret targets for draft versions", async () => {
    getVersionInOrganization.mockResolvedValue({
      secretId: SECRET,
      lifecycleState: "draft",
    });

    await expect(
      validatePromotionDraftTargets({
        organizationId: ORG,
        draftVersionIds: [DRAFT],
      }),
    ).resolves.toEqual([{ secretId: SECRET, secretVersionId: DRAFT }]);
  });
});
