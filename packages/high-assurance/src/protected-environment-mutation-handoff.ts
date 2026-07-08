import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import { createOperation } from "@insecur/operations";

import { HighAssuranceChallengeError } from "./high-assurance-challenge-error.js";
import { HighAssuranceHandoffError } from "./high-assurance-handoff-error.js";
import { requestHighAssuranceChallenge } from "./request-high-assurance-challenge.js";

export async function requestProtectedEnvironmentMutationHandoff(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserId;
  readonly requestId: RequestId;
  readonly intentCode: string;
  readonly riskReasonCode: string;
}): Promise<never> {
  const created = await createOperation({
    organizationId: input.organizationId,
    intentCode: input.intentCode,
  });
  const operationId = created.operation.operationId;
  await requestHighAssuranceChallenge({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    operationId,
    riskReasonCode: input.riskReasonCode,
    requestingUserId: input.actorUserId,
    request: { requestId: input.requestId },
  });
  throw new HighAssuranceHandoffError(operationId);
}

export async function consumeEvidenceOrThrowHandoff<T>(
  operationId: OperationId,
  consume: () => Promise<T>,
): Promise<T> {
  try {
    return await consume();
  } catch (error) {
    if (
      error instanceof HighAssuranceHandoffError ||
      error instanceof HighAssuranceChallengeError
    ) {
      throw error;
    }
    throw new HighAssuranceHandoffError(operationId);
  }
}
