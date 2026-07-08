import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import { assertImpactReviewFresh } from "./assert-impact-review-fresh.js";
import { assertProtectedEnvironment } from "./assert-protected-environment.js";
import { assertSecretProtectedMutationAccess } from "./assert-secret-protected-mutation-access.js";
import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { createPromotionApprovalRequest } from "./create-promotion-approval-request.js";
import { gateProtectedSecretMutation } from "./gate-protected-secret-mutation.js";
import { loadApprovalImpactReviewState } from "./load-approval-impact-review-state.js";
import { noopHighAssuranceDenied } from "./noop-high-assurance-denied.js";
import type {
  RequestProtectedPromotionInput,
  RequestProtectedPromotionResult,
} from "./request-protected-promotion-types.js";
import { toAuditActor } from "./to-audit-actor.js";
import { validatePromotionDraftTargets } from "./validate-promotion-draft-targets.js";

export type {
  RequestProtectedPromotionInput,
  RequestProtectedPromotionResult,
} from "./request-protected-promotion-types.js";

export async function requestProtectedPromotion(
  input: RequestProtectedPromotionInput,
): Promise<RequestProtectedPromotionResult> {
  const scope = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };
  await assertProtectedEnvironment(input.organizationId, input.environmentId);
  await assertSecretProtectedMutationAccess(input.actor, scope);

  const validatedTargets = await validatePromotionDraftTargets({
    organizationId: input.organizationId,
    environmentId: input.environmentId,
    draftVersionIds: input.draftVersionIds,
  });

  const impactReviewFingerprint = await recomputeAndAssertFreshFingerprint(
    scope,
    validatedTargets,
    input.impactReviewFingerprint,
  );

  const gate = await gateProtectedSecretMutation({
    ...scope,
    actor: input.actor,
    mutationKind: "promotion",
    requestId: input.requestId,
    onDenied: noopHighAssuranceDenied,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  const { approvalRequestId: newApprovalRequestId, supersededApprovalRequestIds } =
    await createPromotionApprovalRequest({
      actor: input.actor,
      auditActor: toAuditActor(input.actor),
      ...scope,
      isProtectedEnvironment: true,
      validatedTargets,
      impactReviewFingerprint,
      requestId: input.requestId,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      ...(gate.operationId !== undefined ? { operationId: gate.operationId } : {}),
    });

  return {
    approvalRequestId: newApprovalRequestId,
    impactReviewFingerprint,
    supersededApprovalRequestIds,
    draftVersionIds: input.draftVersionIds,
    ...(gate.operationId !== undefined ? { operationId: gate.operationId } : {}),
  };
}

/**
 * The B2 recompute-then-compare seam (ADR-0017 / INS-85): load the CURRENT live delivery + draft
 * impact, recompute the Approval Impact Review Fingerprint over it server-side, and reject a
 * caller-submitted fingerprint that no longer matches (drift → stale). The freshly recomputed
 * fingerprint is returned so it, not the submitted one, is recorded on the Approval Request.
 */
async function recomputeAndAssertFreshFingerprint(
  scope: { organizationId: OrganizationId; projectId: ProjectId; environmentId: EnvironmentId },
  draftTargets: Awaited<ReturnType<typeof validatePromotionDraftTargets>>,
  submittedFingerprint: string | undefined,
): Promise<string> {
  const impactReviewState = await loadApprovalImpactReviewState({ ...scope, draftTargets });
  const currentFingerprint = await computeImpactReviewFingerprint(impactReviewState);
  assertImpactReviewFresh({ submittedFingerprint, currentFingerprint });
  return currentFingerprint;
}
