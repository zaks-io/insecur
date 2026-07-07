import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { OPERATION_ERROR_CODES } from "@insecur/domain";
import { getOperation, OperationStoreError } from "@insecur/operations";
import { toHighAssuranceChallengeReviewItem } from "@insecur/high-assurance";
import type {
  GetHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcPayload,
} from "@insecur/worker-kit";
import {
  assertHumanReviewActor,
  authorizeHighAssuranceReviewRead,
  hasHighAssuranceReviewScope,
  resolveProjectReviewAccess,
} from "./high-assurance-review-access.js";

export interface GetHighAssuranceChallengeOperationInput {
  readonly input: GetHighAssuranceChallengeRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function getHighAssuranceChallengeOperation({
  input,
  auditActor,
  accessActor,
}: GetHighAssuranceChallengeOperationInput): Promise<GetHighAssuranceChallengeRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);
  await authorizeHighAssuranceReviewRead({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    requestId: input.requestId,
  });

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

  const challenge = toHighAssuranceChallengeReviewItem(operation);
  if (challenge === null) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }

  const access = await resolveProjectReviewAccess(
    accessActor,
    input.organizationId,
    challenge.projectId,
    challenge.environmentId,
  );
  if (!hasHighAssuranceReviewScope(access)) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }

  return { challenge };
}
