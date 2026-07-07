import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { OPERATION_ERROR_CODES, type UserId } from "@insecur/domain";
import { getOperation, OperationStoreError } from "@insecur/operations";
import {
  DENY_HIGH_ASSURANCE_CHALLENGE_REQUIRED_SCOPES,
  denyHighAssuranceChallenge,
} from "@insecur/high-assurance";
import type {
  DenyHighAssuranceChallengeRpcInput,
  DenyHighAssuranceChallengeRpcPayload,
} from "@insecur/worker-kit";
import {
  assertHumanReviewActor,
  resolveProjectReviewAccess,
} from "./high-assurance-review-access.js";

export interface DenyHighAssuranceChallengeOperationInput {
  readonly input: DenyHighAssuranceChallengeRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
  readonly denyingUserId: UserId;
}

export async function denyHighAssuranceChallengeOperation({
  input,
  accessActor,
  denyingUserId,
}: DenyHighAssuranceChallengeOperationInput): Promise<DenyHighAssuranceChallengeRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);

  let operation;
  try {
    operation = await getOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
    });
  } catch (error) {
    if (error instanceof OperationStoreError && error.code === OPERATION_ERROR_CODES.notFound) {
      throw error;
    }
    throw error;
  }

  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }

  const denyingUserAccess = await resolveProjectReviewAccess(
    accessActor,
    input.organizationId,
    evidence.projectId,
    evidence.environmentId,
  );

  await denyHighAssuranceChallenge({
    organizationId: input.organizationId,
    operationId: input.operationId,
    denyingUserId,
    requiredScopes: [...DENY_HIGH_ASSURANCE_CHALLENGE_REQUIRED_SCOPES],
    denyingUserAccess,
    request: { requestId: input.requestId },
  });

  return {
    operationId: input.operationId,
    challengeId: evidence.challengeId,
    state: "canceled",
  };
}
