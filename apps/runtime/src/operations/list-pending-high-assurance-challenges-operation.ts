import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { listPendingHighAssuranceChallenges } from "@insecur/high-assurance";
import type {
  ListPendingHighAssuranceChallengesRpcInput,
  ListPendingHighAssuranceChallengesRpcPayload,
} from "@insecur/worker-kit";
import {
  assertHumanReviewActor,
  authorizeHighAssuranceReviewRead,
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
  await assertHumanReviewActor(accessActor, input.organizationId);
  await authorizeHighAssuranceReviewRead({
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

  if (challenges.length > 0 && visible.length === 0) {
    throw Object.assign(new Error("Missing required permission."), {
      code: "auth.insufficient_scope" as const,
    });
  }

  return { challenges: visible };
}
