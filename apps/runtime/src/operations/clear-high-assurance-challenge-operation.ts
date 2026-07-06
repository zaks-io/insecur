import { AUTHORIZATION_SCOPES } from "@insecur/access";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  clearHighAssuranceChallenge,
  type ClearHighAssuranceChallengeInput,
} from "@insecur/high-assurance";
import type {
  ClearHighAssuranceChallengeRpcInput,
  ClearHighAssuranceChallengeRpcPayload,
} from "@insecur/worker-kit";
import {
  assertHumanReviewActor,
  resolveProjectReviewAccess,
} from "./high-assurance-review-access.js";

export interface ClearHighAssuranceChallengeOperationInput {
  readonly input: ClearHighAssuranceChallengeRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
  readonly clearingUserId: ClearHighAssuranceChallengeInput["clearingUserId"];
}

export async function clearHighAssuranceChallengeOperation({
  input,
  accessActor,
  clearingUserId,
}: ClearHighAssuranceChallengeOperationInput): Promise<ClearHighAssuranceChallengeRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);

  const clearingUserAccess = await resolveProjectReviewAccess(
    accessActor,
    input.organizationId,
    input.projectId,
    input.environmentId,
  );

  const mutation = await clearHighAssuranceChallenge({
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    operationId: input.operationId,
    clearingUserId,
    sessionAssurance: input.sessionAssurance,
    requiredScopes: [AUTHORIZATION_SCOPES.approvalApprove],
    clearingUserAccess,
    request: { requestId: input.requestId },
  });

  const evidence = mutation.operation.progress.highAssuranceChallenge;
  if (evidence?.clearedAt === undefined || evidence.clearingUserId === undefined) {
    throw new Error("cleared high-assurance challenge evidence is missing clear linkage");
  }

  return {
    operationId: input.operationId,
    challengeId: evidence.challengeId,
    clearedAt: evidence.clearedAt,
    clearingUserId: evidence.clearingUserId,
  };
}
