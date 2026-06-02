import { parseDisplayName } from "@insecur/domain";
import { ONBOARDING_ERROR_CODES } from "@insecur/domain";
import { assertInstanceOperator } from "./assert-instance-operator.js";
import { GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES } from "./default-display-names.js";
import { MembershipManagementError } from "./membership-management-error.js";
import { mintOperatorOrganizationIds } from "./mint-operator-organization-ids.js";
import { recordOperatorOrganizationCreated } from "./membership-management-audit.js";
import type {
  CreateOperatorOrganizationInput,
  CreateOperatorOrganizationResult,
} from "./operator-organization-types.js";
import { persistOperatorOrganization } from "./persist-operator-organization.js";

export type {
  CreateOperatorOrganizationInput,
  CreateOperatorOrganizationResult,
  OperatorOrganizationResourceIds,
} from "./operator-organization-types.js";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

function resolveDisplayName(raw: string | undefined, fallback: string) {
  const parsed = parseDisplayName(raw ?? fallback);
  if (!parsed.ok) {
    throw new MembershipManagementError(parsed.code, "invalid display name");
  }
  return parsed.value;
}

/**
 * Creates an Organization and non-authorizing Default Team under Instance Operator authority.
 */
export async function createOperatorOrganization(
  input: CreateOperatorOrganizationInput,
): Promise<CreateOperatorOrganizationResult> {
  await assertInstanceOperator(input.instanceId, input.operatorUserId);

  const ids = mintOperatorOrganizationIds(input.resourceIds);
  const organizationDisplayName = resolveDisplayName(
    input.organizationDisplayName,
    GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.organization,
  );
  const teamDisplayName = resolveDisplayName(
    input.teamDisplayName,
    GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.team,
  );

  try {
    await persistOperatorOrganization({
      instanceId: input.instanceId,
      organizationId: ids.organizationId,
      defaultTeamId: ids.defaultTeamId,
      organizationDisplayName,
      teamDisplayName,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    throw new MembershipManagementError(
      ONBOARDING_ERROR_CODES.resourceConflict,
      "operator organization resource id conflict",
      ids.organizationId,
    );
  }

  await recordOperatorOrganizationCreated({
    operatorUserId: input.operatorUserId,
    organizationId: ids.organizationId,
    defaultTeamId: ids.defaultTeamId,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });

  return ids;
}
