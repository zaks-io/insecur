import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type { EnvironmentId, OrganizationId, ProjectId, RequestId } from "@insecur/domain";
import type { ApprovalRequestRequester } from "@insecur/tenant-store";

import { assertProtectedChangeCreateAccess } from "./assert-protected-change-access.js";
import { requesterFromActor } from "./requester-from-actor.js";

export interface ApprovalRequestCreateAuthzInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}

/**
 * Runs the Effective Access Resolver authorization for creating an Approval Request on the
 * affected Project + Protected Environment (ADR-0017) and returns the requester binding to
 * persist. Both the promotion and rollback creators call this before any supersede/insert so
 * the authz is structurally enforced at the seam, not left to whatever route wires it.
 */
export async function authorizeApprovalRequestCreate(
  input: ApprovalRequestCreateAuthzInput,
): Promise<ApprovalRequestRequester> {
  await assertProtectedChangeCreateAccess(input);

  return requesterFromActor(input.actor);
}
