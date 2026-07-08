import {
  APPROVAL_ERROR_CODES,
  environmentId,
  organizationId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

const { getDraftPromotionTargetInEnvironment } = vi.hoisted(() => ({
  getDraftPromotionTargetInEnvironment: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  TenantSecretVersionStore: vi.fn(function MockStore(this: {
    getDraftPromotionTargetInEnvironment: typeof getDraftPromotionTargetInEnvironment;
  }) {
    this.getDraftPromotionTargetInEnvironment = getDraftPromotionTargetInEnvironment;
  }),
  withTenantScope: vi.fn(async (_scope, callback) => callback({ db: {} })),
}));

import { validatePromotionDraftTargets } from "../src/validate-promotion-draft-targets.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const DRAFT = secretVersionId.brand("sv_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");

describe("validatePromotionDraftTargets", () => {
  it("rejects a version the store does not resolve as a draft in the target environment", async () => {
    // The store returns null for non-draft, missing, or cross-environment versions.
    getDraftPromotionTargetInEnvironment.mockResolvedValue(null);

    await expect(
      validatePromotionDraftTargets({
        organizationId: ORG,
        environmentId: ENV,
        draftVersionIds: [DRAFT],
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.invalidDraftSelection });
  });

  it("passes the target environment to the store so cross-environment drafts cannot be smuggled in", async () => {
    getDraftPromotionTargetInEnvironment.mockResolvedValue({
      secretId: SECRET,
      secretVersionId: DRAFT,
    });

    await validatePromotionDraftTargets({
      organizationId: ORG,
      environmentId: ENV,
      draftVersionIds: [DRAFT],
    });

    expect(getDraftPromotionTargetInEnvironment).toHaveBeenCalledWith({
      organizationId: ORG,
      environmentId: ENV,
      secretVersionId: DRAFT,
    });
  });

  it("returns secret targets for valid in-environment draft versions", async () => {
    getDraftPromotionTargetInEnvironment.mockResolvedValue({
      secretId: SECRET,
      secretVersionId: DRAFT,
    });

    await expect(
      validatePromotionDraftTargets({
        organizationId: ORG,
        environmentId: ENV,
        draftVersionIds: [DRAFT],
      }),
    ).resolves.toEqual([{ secretId: SECRET, secretVersionId: DRAFT }]);
  });
});
