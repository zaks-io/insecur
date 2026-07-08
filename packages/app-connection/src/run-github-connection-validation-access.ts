import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { auditKnownConnectionValidationDenials } from "./audit-known-connection-validation-denials.js";
import type { LoadedGitHubConnectionMetadata } from "./load-github-connection-boundary.js";
import { recordConnectionValidationDenied } from "./record-connection-audit.js";
import type { ConnectionOperationScope } from "./with-connection-access.js";

export interface GitHubValidationOperationInput extends ConnectionOperationScope {
  readonly actor: UserActorRef;
}

export async function runGithubConnectionValidationAccess<T>(
  input: GitHubValidationOperationInput,
  withAccess: (
    scope: ConnectionOperationScope & {
      readonly recordDenied: () => Promise<void>;
      readonly run: (
        connection: AppConnectionRow,
        metadata: LoadedGitHubConnectionMetadata,
      ) => Promise<T>;
    },
  ) => Promise<T>,
  run: (connection: AppConnectionRow, metadata: LoadedGitHubConnectionMetadata) => Promise<T>,
): Promise<T> {
  try {
    return await withAccess({
      ...input,
      recordDenied: async () => {
        await recordConnectionValidationDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        });
      },
      run,
    });
  } catch (error) {
    await auditKnownConnectionValidationDenials({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      error,
    });
    throw error;
  }
}
