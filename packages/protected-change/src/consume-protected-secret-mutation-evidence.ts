import { AUTHORIZATION_SCOPES, type UserActorRef } from "@insecur/access";
import type { EnvironmentId, OperationId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  consumeHighAssuranceEvidence,
  HIGH_ASSURANCE_ERROR_CODES,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  HighAssuranceChallengeError,
} from "@insecur/high-assurance";
import { getOperation } from "@insecur/operations";

import type { ProtectedSecretMutationKind } from "./gate-protected-secret-mutation.js";

export interface ConsumeProtectedSecretMutationEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly operationId: OperationId;
  readonly actorUserId: UserActorRef["userId"];
  readonly mutationKind: ProtectedSecretMutationKind;
}

function expectedRiskReason(kind: ProtectedSecretMutationKind): string {
  return kind === "promotion"
    ? HIGH_ASSURANCE_RISK_REASON_CODES.protectedPromotion
    : HIGH_ASSURANCE_RISK_REASON_CODES.protectedRollback;
}

export async function consumeProtectedSecretMutationEvidence(
  input: ConsumeProtectedSecretMutationEvidenceInput,
  onDenied: (error: HighAssuranceChallengeError) => Promise<void>,
): Promise<void> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });
  const riskReasonCode = operation.progress.highAssuranceChallenge?.riskReasonCode;
  if (riskReasonCode !== expectedRiskReason(input.mutationKind)) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "high-assurance evidence risk reason does not match protected secret mutation",
    );
  }

  try {
    await consumeHighAssuranceEvidence({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      operationId: input.operationId,
      resumingUserId: input.actorUserId,
      clearingUserId: input.actorUserId,
      requiredScopes: [AUTHORIZATION_SCOPES.secretProtectedDraftWrite],
    });
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      await onDenied(error);
    }
    throw error;
  }
}
