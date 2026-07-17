import { AUTHORIZATION_SCOPES, type UserActorRef } from "@insecur/access";
import type { EnvironmentId, OperationId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  consumeHighAssuranceEvidence,
  HIGH_ASSURANCE_ERROR_CODES,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  HighAssuranceChallengeError,
} from "@insecur/high-assurance";
import { getOperation } from "@insecur/operations";

export interface ConsumeDeliveryPolicyChangeEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly operationId: OperationId;
  readonly actor: UserActorRef;
}

/**
 * Consumes single-use High-Assurance Challenge evidence for a Risk-Broadening Delivery Change
 * (ADR-0043): loosening a preset or enabling a Preview Automation Opt-In. The evidence must have
 * been requested with the `delivery_risk_policy_change` risk reason; any other reason fails closed
 * so evidence cleared for one gated action class cannot authorize a delivery policy change.
 */
export async function consumeDeliveryPolicyChangeEvidence(
  input: ConsumeDeliveryPolicyChangeEvidenceInput,
): Promise<void> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  const riskReasonCode = operation.progress.highAssuranceChallenge?.riskReasonCode;
  if (riskReasonCode !== HIGH_ASSURANCE_RISK_REASON_CODES.deliveryRiskPolicyChange) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "high-assurance evidence risk reason does not match delivery risk policy change",
    );
  }

  await consumeHighAssuranceEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
    operationId: input.operationId,
    resumingUserId: input.actor.userId,
    clearingUserId: input.actor.userId,
    requiredScopes: [AUTHORIZATION_SCOPES.deliveryPolicyManage],
  });
}
