import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { AUTH_ERROR_CODES, organizationId, projectId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveEffectiveAccessMock = vi.hoisted(() => vi.fn());
const hasAuthorizationScopeMock = vi.hoisted(() => vi.fn());

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: resolveEffectiveAccessMock,
    hasAuthorizationScope: hasAuthorizationScopeMock,
  };
});

import { assertMembershipManageScope } from "../src/assert-membership-manage-scope.js";
import { MembershipManagementError } from "../src/membership-management-error.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };

describe("assertMembershipManageScope", () => {
  beforeEach(() => {
    resolveEffectiveAccessMock.mockReset();
    hasAuthorizationScopeMock.mockReset();
  });

  it("allows actors with membership manage scope at organization scope", async () => {
    resolveEffectiveAccessMock.mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.membershipManage],
    });
    hasAuthorizationScopeMock.mockReturnValue(true);

    await expect(assertMembershipManageScope(ACTOR, ORG)).resolves.toBeUndefined();

    expect(resolveEffectiveAccessMock).toHaveBeenCalledWith(ACTOR, { organizationId: ORG });
    expect(hasAuthorizationScopeMock).toHaveBeenCalledWith(
      { scopes: [AUTHORIZATION_SCOPES.membershipManage] },
      AUTHORIZATION_SCOPES.membershipManage,
    );
  });

  it("resolves project-scoped membership manage checks", async () => {
    resolveEffectiveAccessMock.mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.membershipManage],
    });
    hasAuthorizationScopeMock.mockReturnValue(true);

    await expect(assertMembershipManageScope(ACTOR, ORG, PROJECT)).resolves.toBeUndefined();

    expect(resolveEffectiveAccessMock).toHaveBeenCalledWith(ACTOR, {
      organizationId: ORG,
      projectId: PROJECT,
    });
  });

  it("denies actors without membership manage scope", async () => {
    resolveEffectiveAccessMock.mockResolvedValue({ scopes: [] });
    hasAuthorizationScopeMock.mockReturnValue(false);

    await expect(assertMembershipManageScope(ACTOR, ORG)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    await expect(assertMembershipManageScope(ACTOR, ORG)).rejects.toBeInstanceOf(
      MembershipManagementError,
    );
  });
});
