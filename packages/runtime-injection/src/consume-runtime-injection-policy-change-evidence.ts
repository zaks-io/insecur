import { AUTHORIZATION_SCOPES, type UserActorRef } from "@insecur/access";
import type { OperationId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  consumeHighAssuranceEvidence,
  HIGH_ASSURANCE_ERROR_CODES,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  HighAssuranceChallengeError,
} from "@insecur/high-assurance";
import { getOperation } from "@insecur/operations";

export interface ConsumeRuntimeInjectionPolicyChangeEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly actor: UserActorRef;
}

function assertPolicyChangeRiskReason(riskReasonCode: string | undefined): void {
  if (riskReasonCode !== HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "high-assurance evidence risk reason does not match runtime injection policy change",
    );
  }
}

async function consumeRuntimeInjectionPolicyChangeEvidence(
  input: ConsumeRuntimeInjectionPolicyChangeEvidenceInput,
): Promise<void> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });
  assertPolicyChangeRiskReason(operation.progress.highAssuranceChallenge?.riskReasonCode);

  await consumeHighAssuranceEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    resumingUserId: input.actor.userId,
    clearingUserId: input.actor.userId,
    requiredScopes: [AUTHORIZATION_SCOPES.projectConfigure],
  });
}

export async function requireRuntimeInjectionPolicyChangeEvidence(
  input: ConsumeRuntimeInjectionPolicyChangeEvidenceInput,
  onDenied: (error: HighAssuranceChallengeError) => Promise<void>,
): Promise<void> {
  try {
    await consumeRuntimeInjectionPolicyChangeEvidence(input);
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      await onDenied(error);
    }
    throw error;
  }
}
