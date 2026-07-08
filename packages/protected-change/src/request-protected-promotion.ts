import { assertImpactReviewFresh } from "./assert-impact-review-fresh.js";
import { assertProtectedEnvironment } from "./assert-protected-environment.js";
import { assertSecretProtectedMutationAccess } from "./assert-secret-protected-mutation-access.js";
import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { createPromotionApprovalRequest } from "./create-promotion-approval-request.js";
import { gateProtectedSecretMutation } from "./gate-protected-secret-mutation.js";
import { noopHighAssuranceDenied } from "./noop-high-assurance-denied.js";
import type {
  RequestProtectedPromotionInput,
  RequestProtectedPromotionResult,
} from "./request-protected-promotion-types.js";
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
    draftVersionIds: input.draftVersionIds,
  });

  const impactReviewFingerprint = computeImpactReviewFingerprint({
    ...scope,
    draftVersionIds: input.draftVersionIds,
    secretIds: validatedTargets.map((target) => target.secretId),
  });
  assertImpactReviewFresh({
    submittedFingerprint: input.impactReviewFingerprint,
    currentFingerprint: impactReviewFingerprint,
  });

  const gate = await gateProtectedSecretMutation({
    ...scope,
    actorUserId: input.actor.userId,
    mutationKind: "promotion",
    requestId: input.requestId,
    onDenied: noopHighAssuranceDenied,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  const { approvalRequestId: newApprovalRequestId, supersededApprovalRequestIds } =
    await createPromotionApprovalRequest({
      actor: input.actor,
      ...scope,
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
