import {
  membershipId,
  teamId,
  VALIDATION_ERROR_CODES,
  type EnvironmentId,
  type MembershipId,
  type OrganizationId,
  type ProjectId,
  type TeamId,
} from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";

export interface GuidedOrganizationProvisionRequestIds {
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
}

export interface GuidedOrganizationResourceIdsBody {
  readonly organizationId: OrganizationId;
  readonly defaultTeamId: TeamId;
  readonly ownerMembershipId: MembershipId;
  readonly projectId: ProjectId;
  readonly developmentEnvironmentId: EnvironmentId;
}

function assertPartialScopeIds(
  organizationIdValue: OrganizationId | undefined,
  projectIdValue: ProjectId | undefined,
  environmentIdValue: EnvironmentId | undefined,
): void {
  const provided = [organizationIdValue, projectIdValue, environmentIdValue].filter(
    (value) => value !== undefined,
  ).length;
  if (provided > 0 && provided < 3) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
        message:
          "Provide all of --org-id, --project-id, and --env-id together, or omit them for server-minted ids.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

/**
 * Worker POST /v1/onboarding/personal-organization expects optional nested resourceIds.
 */
export function buildPersonalOrganizationRequestBody(
  ids: GuidedOrganizationProvisionRequestIds,
): Record<string, unknown> {
  assertPartialScopeIds(ids.organizationId, ids.projectId, ids.environmentId);
  if (
    ids.organizationId === undefined ||
    ids.projectId === undefined ||
    ids.environmentId === undefined
  ) {
    return {};
  }
  const resourceIds: GuidedOrganizationResourceIdsBody = {
    organizationId: ids.organizationId,
    defaultTeamId: teamId.generate(),
    ownerMembershipId: membershipId.generate(),
    projectId: ids.projectId,
    developmentEnvironmentId: ids.environmentId,
  };
  return { resourceIds };
}
