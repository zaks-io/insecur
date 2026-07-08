import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { listPendingHighAssuranceChallenges } from "@insecur/high-assurance";
import type {
  ListPendingHighAssuranceChallengesRpcInput,
  ListPendingHighAssuranceChallengesRpcPayload,
} from "@insecur/worker-kit";
import {
  assertHighAssuranceReviewReadPrelude,
  filterReviewItemsByEffectiveAccess,
} from "./high-assurance-review-access.js";

export interface ListPendingHighAssuranceChallengesOperationInput {
  readonly input: ListPendingHighAssuranceChallengesRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function listPendingHighAssuranceChallengesOperation({
  input,
  auditActor,
  accessActor,
}: ListPendingHighAssuranceChallengesOperationInput): Promise<ListPendingHighAssuranceChallengesRpcPayload> {
  await assertHighAssuranceReviewReadPrelude({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    requestId: input.requestId,
  });

  const challenges = await listPendingHighAssuranceChallenges({
    organizationId: input.organizationId,
  });
  const visible = await filterReviewItemsByEffectiveAccess(
    accessActor,
    input.organizationId,
    challenges,
  );

  return { challenges: visible };
}
