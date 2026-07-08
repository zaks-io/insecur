import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";

import { AppConnectionError } from "./app-connection-error.js";
import { recordConnectionValidationDenied } from "./record-connection-audit.js";

export async function auditKnownConnectionValidationDenials(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly error: unknown;
  readonly reasonCodes?: readonly KnownErrorCode[];
}): Promise<void> {
  const allowedReasonCodes = input.reasonCodes ?? [
    APP_CONNECTION_ERROR_CODES.notFound,
    APP_CONNECTION_ERROR_CODES.disconnected,
  ];

  if (input.error instanceof AppConnectionError && allowedReasonCodes.includes(input.error.code)) {
    await recordConnectionValidationDenied({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      reasonCode: input.error.code,
    });
  }
}
