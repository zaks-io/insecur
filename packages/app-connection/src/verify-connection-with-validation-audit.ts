import type { AppConnectionId, OrganizationId, ProjectId, UserId } from "@insecur/domain";

import {
  recordConnectionValidationDenied,
  toConnectionAuditReasonCode,
} from "./record-connection-audit.js";

export async function verifyConnectionWithValidationAudit<T>(
  input: {
    readonly actorUserId: UserId;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly appConnectionId: AppConnectionId;
  },
  verify: () => Promise<T>,
): Promise<T> {
  try {
    return await verify();
  } catch (error) {
    try {
      await recordConnectionValidationDenied({
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        appConnectionId: input.appConnectionId,
        reasonCode: toConnectionAuditReasonCode(error),
      });
    } catch {
      // The provider denial and its error code are the caller's contract; an audit-store
      // failure must not replace them.
    }
    throw error;
  }
}
