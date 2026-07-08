import type { ApprovalRequestRequester } from "@insecur/tenant-store";

import {
  guardProtectedChangeCreate,
  type ProtectedChangeCreateGuardInput,
} from "./assert-protected-change-access.js";
import { isProtectedChangeError } from "./protected-change-errors.js";
import { recordDeniedApprovalRequestCreate } from "./record-created-approval-request-audit.js";
import { requesterFromActor } from "./requester-from-actor.js";

export type ApprovalRequestCreateAuthzInput = ProtectedChangeCreateGuardInput;

/**
 * Authorizes creating an Approval Request, at parity with `createProtectedChange`: it fails closed
 * on a non-protected environment coordinate, then runs the Effective Access Resolver authorization
 * for the affected Project + Protected Environment (ADR-0017), recording a metadata-only denied
 * audit when authz fails. Returns the requester binding to persist. Both the promotion and rollback
 * creators call this before any supersede/insert so the guarantees are enforced at the seam.
 */
export async function authorizeApprovalRequestCreate(
  input: ApprovalRequestCreateAuthzInput,
): Promise<ApprovalRequestRequester> {
  await guardProtectedChangeCreate(input, (error) =>
    recordDeniedApprovalRequestCreate({
      auditActor: input.auditActor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      requestId: input.requestId,
      ...(isProtectedChangeError(error) ? { reasonCode: error.code } : {}),
    }),
  );

  return requesterFromActor(input.actor);
}
