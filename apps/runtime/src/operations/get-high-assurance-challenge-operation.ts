import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type {
  GetHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcPayload,
} from "@insecur/worker-kit";
import {
  assertHighAssuranceReviewReadPrelude,
  loadReviewableHighAssuranceChallenge,
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
  await assertHighAssuranceReviewReadPrelude({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    requestId: input.requestId,
  });

  const challenge = await loadReviewableHighAssuranceChallenge({
    accessActor,
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  return { challenge };
}
