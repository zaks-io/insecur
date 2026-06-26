import { invitationId, ONBOARDING_ERROR_CODES, organizationId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { MembershipManagementError } from "../src/membership-management-error.js";
import { GuidedOrganizationProvisionError } from "../src/provision-guided-organization-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const INV = invitationId.brand("inv_00000000000000000000000001");

describe("MembershipManagementError", () => {
  it("carries code and optional organization and invitation ids", () => {
    const error = new MembershipManagementError(
      ONBOARDING_ERROR_CODES.invitationNotPending,
      "invitation is not pending",
      ORG,
      INV,
    );

    expect(error.name).toBe("MembershipManagementError");
    expect(error.code).toBe(ONBOARDING_ERROR_CODES.invitationNotPending);
    expect(error.organizationId).toBe(ORG);
    expect(error.invitationId).toBe(INV);
    expect(error.message).toBe("invitation is not pending");
  });

  it("omits optional ids when not provided", () => {
    const error = new MembershipManagementError(
      ONBOARDING_ERROR_CODES.notInstanceOperator,
      "instance operator authority required",
    );

    expect(error.organizationId).toBeUndefined();
    expect(error.invitationId).toBeUndefined();
  });
});

describe("GuidedOrganizationProvisionError", () => {
  it("carries code and optional organization id", () => {
    const error = new GuidedOrganizationProvisionError(
      ONBOARDING_ERROR_CODES.resourceConflict,
      "guided organization resource id conflict",
      ORG,
    );

    expect(error.name).toBe("GuidedOrganizationProvisionError");
    expect(error.code).toBe(ONBOARDING_ERROR_CODES.resourceConflict);
    expect(error.organizationId).toBe(ORG);
  });
});
