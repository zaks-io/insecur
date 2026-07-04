import type { AppConnectionId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import type { CloudflareScopedTokenVerifyResult } from "./cloudflare-scoped-token-port.js";
import { recordConnectionValidated } from "./record-connection-audit.js";

export interface PersistConnectionValidationSuccessInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly checkedAt: Date;
  readonly validationResult: CloudflareScopedTokenVerifyResult;
  readonly appConnectionStore: TenantAppConnectionStore;
}

/**
 * Records fresh validation evidence after a successful provider verify: updates the
 * connection's `last_validation_*` columns and writes the `connection.validated` audit event.
 */
export async function persistConnectionValidationSuccess(
  input: PersistConnectionValidationSuccessInput,
): Promise<AppConnectionRow> {
  const connection = await input.appConnectionStore.updateConnectionValidation({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    lastValidationCheckedAt: input.checkedAt,
    lastValidationOutcome: "success",
    lastValidationReasonCode: null,
  });

  await recordConnectionValidated({
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    validation: input.validationResult,
  });

  return connection;
}
