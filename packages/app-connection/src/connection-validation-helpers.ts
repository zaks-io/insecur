import type { AppConnectionId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import { AppConnectionError, APP_CONNECTION_ERROR_CODES } from "./app-connection-error.js";
import {
  recordConnectionValidationDenied,
  toConnectionAuditReasonCode,
} from "./record-connection-audit.js";

export async function recordConnectionValidationFailure(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly checkedAt: Date;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly error: unknown;
}): Promise<never> {
  const reasonCode = toConnectionAuditReasonCode(input.error);
  await input.appConnectionStore.updateConnectionValidation({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    lastValidationCheckedAt: input.checkedAt,
    lastValidationOutcome: "failed",
    lastValidationReasonCode: reasonCode,
  });
  await recordConnectionValidationDenied({
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    reasonCode,
  });
  throw input.error;
}

export function assertConnectionReadyForValidation(connection: AppConnectionRow): void {
  if (connection.status === "disconnected") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.disconnected);
  }
  if (
    connection.activeCredentialId === null &&
    connection.connectionMethod === "scoped-api-token"
  ) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.credentialMissing);
  }
}
