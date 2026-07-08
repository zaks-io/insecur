import type { ActorRef } from "@insecur/access";
import {
  PRODUCTION_AUDIT_EVENT_CODES,
  recordApprovalAudit,
  recordStorageAudit,
  type AuditActorRef,
} from "@insecur/audit";
import {
  APPROVAL_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  type ApprovalRequestId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantApprovalRequestStore,
  TenantSecretVersionStore,
  withTenantScope,
  type DiscardDraftSecretVersionResult,
  type SecretVersionCreatorActor,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { ApprovalRequestError } from "./approval-request-errors.js";
import { assertDiscardDraftVersionAccess } from "./assert-discard-draft-version-access.js";

export interface DiscardDraftVersionInput {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly requestId?: RequestId;
}

export interface DiscardDraftVersionResult {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly alreadyDiscarded: boolean;
  readonly closedApprovalRequestCount: number;
}

function toAuditActor(actor: ActorRef): AuditActorRef {
  if (actor.type === "user") {
    return { type: "user", userId: actor.userId };
  }
  return { type: "machine", machineIdentityId: actor.machineIdentityId };
}

interface DiscardTransactionResult {
  readonly discard: DiscardDraftSecretVersionResult;
  readonly closedApprovalRequestIds: readonly ApprovalRequestId[];
}

async function loadDraftCreator(
  input: DiscardDraftVersionInput,
): Promise<SecretVersionCreatorActor | null> {
  return withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    new TenantSecretVersionStore(db).getDraftVersionCreator({
      organizationId: input.organizationId,
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
    }),
  );
}

async function authorizeDiscard(
  input: DiscardDraftVersionInput,
  scope: { organizationId: OrganizationId; projectId: ProjectId; environmentId: EnvironmentId },
  auditActor: AuditActorRef,
): Promise<void> {
  try {
    const creator = await loadDraftCreator(input);
    await assertDiscardDraftVersionAccess(input.actor, scope, creator);
  } catch (error) {
    await recordDiscardDenied(input, scope, auditActor);
    throw error;
  }
}

async function runDiscardTransaction(
  db: TenantScopedDb,
  input: DiscardDraftVersionInput,
): Promise<DiscardTransactionResult> {
  let discardResult: DiscardDraftSecretVersionResult;
  try {
    discardResult = await new TenantSecretVersionStore(db).discardDraftVersion({
      organizationId: input.organizationId,
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
    });
  } catch (error) {
    if (
      error instanceof SecretVersionStoreNotFoundError ||
      error instanceof SecretVersionStoreConflictError
    ) {
      throw new ApprovalRequestError(
        APPROVAL_ERROR_CODES.draftVersionNotDiscardable,
        "draft secret version is not discardable",
      );
    }
    throw error;
  }

  if (discardResult.alreadyDiscarded) {
    return { discard: discardResult, closedApprovalRequestIds: [] };
  }

  const closed = await new TenantApprovalRequestStore(
    db,
  ).closePendingApprovalRequestsForDiscardedDraftVersion({
    organizationId: input.organizationId,
    secretVersionId: input.secretVersionId,
  });

  return { discard: discardResult, closedApprovalRequestIds: closed };
}

async function recordDiscardDenied(
  input: DiscardDraftVersionInput,
  scope: { organizationId: OrganizationId; projectId: ProjectId; environmentId: EnvironmentId },
  auditActor: AuditActorRef,
): Promise<void> {
  await recordStorageAudit({
    outcome: "denied",
    actor: auditActor,
    ...scope,
    secretId: input.secretId,
    secretVersionId: input.secretVersionId,
    ...(input.requestId !== undefined ? { request: { requestId: input.requestId } } : {}),
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretDraftVersionDiscardDenied,
  });
}

async function recordDiscardSuccessAndClosures(
  input: DiscardDraftVersionInput,
  scope: { organizationId: OrganizationId; projectId: ProjectId; environmentId: EnvironmentId },
  auditActor: AuditActorRef,
  closedApprovalRequestIds: readonly ApprovalRequestId[],
): Promise<void> {
  await recordStorageAudit({
    outcome: "success",
    actor: auditActor,
    ...scope,
    secretId: input.secretId,
    secretVersionId: input.secretVersionId,
    ...(input.requestId !== undefined ? { request: { requestId: input.requestId } } : {}),
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretDraftVersionDiscarded,
  });

  for (const approvalRequestId of closedApprovalRequestIds) {
    await recordApprovalAudit({
      action: "request_draft_discard_closed",
      outcome: "success",
      actor: auditActor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      resource: {
        type: "approval_request",
        id: brandOpaqueResourceIdForPrefix("apr", approvalRequestId),
      },
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    });
  }
}

/**
 * Draft Version Discard (ADR-0017 §27): a terminal, crypto-erasing close of a Draft Version. Unlike
 * Promotion or Rollback, discard does not require the High-Assurance mutation gate or an Approval
 * Request of its own. Authorization is narrower than draft-write: only the creating User or Machine
 * Identity (while still authorized) or a scoped owner/admin cleanup actor may discard, and a
 * creator-less draft is discardable only by owner/admin. Discarding closes any pending Approval
 * Request whose Promotion Change Set includes the discarded Draft Version (status ->
 * `draft_discard_closed`); existing Partial Approvals on those requests become audit-only because
 * the request is no longer pending.
 */
export async function discardDraftVersion(
  input: DiscardDraftVersionInput,
): Promise<DiscardDraftVersionResult> {
  const scope = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };
  const auditActor = toAuditActor(input.actor);

  await authorizeDiscard(input, scope, auditActor);

  const { discard, closedApprovalRequestIds } = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) => runDiscardTransaction(db, input),
  );

  await recordDiscardSuccessAndClosures(input, scope, auditActor, closedApprovalRequestIds);

  return {
    secretId: discard.secretId,
    secretVersionId: discard.secretVersionId,
    alreadyDiscarded: discard.alreadyDiscarded,
    closedApprovalRequestCount: closedApprovalRequestIds.length,
  };
}
