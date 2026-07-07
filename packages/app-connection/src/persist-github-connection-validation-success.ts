import type { AppConnectionId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import type { GitHubAppInstallationVerifyResult } from "./github-app-port.js";
import {
  recordGithubConnectionValidated,
  type GithubConnectionValidationAuditDetails,
} from "./record-connection-audit.js";

export interface PersistGithubConnectionValidationSuccessInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly checkedAt: Date;
  readonly validationResult: GitHubAppInstallationVerifyResult;
  readonly appConnectionStore: TenantAppConnectionStore;
}

/**
 * Records fresh validation evidence after a successful provider verify: updates the
 * connection's `last_validation_*` columns and writes the `connection.validated` audit event.
 */
export async function persistGithubConnectionValidationSuccess(
  input: PersistGithubConnectionValidationSuccessInput,
): Promise<AppConnectionRow> {
  const connection = await input.appConnectionStore.updateConnectionValidation({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    lastValidationCheckedAt: input.checkedAt,
    lastValidationOutcome: "success",
    lastValidationReasonCode: null,
  });

  await recordGithubConnectionValidated({
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    validation: toGithubValidationAuditDetails(input.validationResult),
  });

  return connection;
}

function toGithubValidationAuditDetails(
  validationResult: GitHubAppInstallationVerifyResult,
): GithubConnectionValidationAuditDetails {
  return {
    installationStatus: validationResult.installationStatus,
    accessibleRepositoryCount: validationResult.accessibleRepositoryCount,
    repositoriesWithinBoundary: validationResult.repositoriesWithinBoundary,
  };
}
