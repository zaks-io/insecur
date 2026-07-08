import type { AppConnectionId, OrganizationId, ProjectId, UserId } from "@insecur/domain";

import type { GitHubConnectionBoundary } from "./github-app-metadata.js";
import type {
  GitHubAppInstallationPort,
  GitHubAppInstallationVerifyResult,
} from "./github-app-port.js";
import { verifyConnectionWithValidationAudit } from "./verify-connection-with-validation-audit.js";

export interface VerifyGitHubInstallationInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly boundary: GitHubConnectionBoundary;
  readonly providerAppRegistrationId: string;
  readonly githubPort: GitHubAppInstallationPort;
}

/**
 * Verifies a candidate GitHub App installation against the connection boundary before any
 * activation side effects. Denials are audited as `connection.validation_denied` and rethrown.
 */
export async function verifyGitHubInstallation(
  input: VerifyGitHubInstallationInput,
): Promise<GitHubAppInstallationVerifyResult> {
  return verifyConnectionWithValidationAudit(input, () =>
    input.githubPort.verifyInstallation({
      ...input.boundary,
      providerAppRegistrationId: input.providerAppRegistrationId,
    }),
  );
}
