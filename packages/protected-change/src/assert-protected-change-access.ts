import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  type ActorRef,
  type AuthorizeScopeDeps,
  type ResourceCoordinate,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";

import { ProtectedChangeError } from "./protected-change-errors.js";
import type { ProtectedChangeRecord } from "./protected-change-types.js";

export type ProtectedChangeAccessAction =
  "create" | "submit" | "approve" | "reject" | "cancel" | "execute";

export interface AssertProtectedChangeAccessInput {
  readonly action: ProtectedChangeAccessAction;
  readonly actor: ActorRef;
  readonly auditActor: Parameters<typeof authorizeScopeOrThrow>[0]["auditActor"];
  readonly coordinate: ResourceCoordinate;
  readonly requestId: RequestId;
  readonly record?: ProtectedChangeRecord;
  readonly deps?: AuthorizeScopeDeps;
}

function requiredScopeForAction(action: ProtectedChangeAccessAction) {
  switch (action) {
    case "create":
    case "submit":
    case "execute":
      return AUTHORIZATION_SCOPES.secretProtectedDraftWrite;
    case "approve":
      return AUTHORIZATION_SCOPES.approvalApprove;
    case "reject":
      return AUTHORIZATION_SCOPES.approvalReject;
    case "cancel":
      return AUTHORIZATION_SCOPES.secretProtectedDraftWrite;
  }
}

function actorMatchesRequester(actor: ActorRef, record: ProtectedChangeRecord): boolean {
  if (actor.type === "user") {
    return record.requesterUserId === actor.userId;
  }
  return record.requesterMachineIdentityId === actor.machineIdentityId;
}

function assertCancelRequester(input: AssertProtectedChangeAccessInput): void {
  const record = input.record;
  if (record === undefined) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.notFound,
      "protected change not found",
    );
  }
  if (!actorMatchesRequester(input.actor, record)) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.requesterMismatch,
      "only the requester may cancel this protected change",
    );
  }
}

export async function assertProtectedChangeAccess(
  input: AssertProtectedChangeAccessInput,
): Promise<void> {
  if (input.action === "cancel") {
    assertCancelRequester(input);
  }

  await authorizeScopeOrThrow({
    actor: input.actor,
    auditActor: input.auditActor,
    coordinate: input.coordinate,
    requiredScope: requiredScopeForAction(input.action),
    requestId: input.requestId,
    ...(input.deps === undefined ? {} : { deps: input.deps }),
  });
}

/**
 * Authorizes creating a Protected Change / Approval Request for a coordinate (ADR-0017 create
 * scope). Shared by the protected-change and approval-request create paths so the create-scope
 * authorization is expressed in exactly one place.
 */
export async function assertProtectedChangeCreateAccess(input: {
  readonly actor: ActorRef;
  readonly auditActor: AssertProtectedChangeAccessInput["auditActor"];
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}): Promise<void> {
  await assertProtectedChangeAccess({
    action: "create",
    actor: input.actor,
    auditActor: input.auditActor,
    coordinate: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
    requestId: input.requestId,
    ...(input.deps === undefined ? {} : { deps: input.deps }),
  });
}

export function isProtectedChangeAccessDenied(error: unknown): boolean {
  if (error instanceof ProtectedChangeError) {
    return (
      error.code === PROTECTED_CHANGE_ERROR_CODES.requesterMismatch ||
      error.code === PROTECTED_CHANGE_ERROR_CODES.missingEvidence
    );
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === AUTH_ERROR_CODES.insufficientScope
  );
}

export function assertProtectedEnvironmentCoordinate(input: {
  readonly isProtected: boolean;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): void {
  if (!input.isProtected) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.nonProtectedEnvironment,
      "protected changes require a protected environment",
    );
  }
}

export function assertApprovalEvidencePresent(
  impactReviewFingerprint: string | undefined,
): asserts impactReviewFingerprint is string {
  if (impactReviewFingerprint === undefined || impactReviewFingerprint.length === 0) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "approval evidence fingerprint is required",
    );
  }
}
