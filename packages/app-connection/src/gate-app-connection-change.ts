import type { OperationId, OrganizationId, ProjectId, RequestId, UserId } from "@insecur/domain";
import {
  HighAssuranceChallengeError,
  HighAssuranceHandoffError,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  requestHighAssuranceChallenge,
} from "@insecur/high-assurance";
import { createOperation, OPERATION_INTENT_CODES } from "@insecur/operations";

import { requireAppConnectionChangeEvidence } from "./consume-app-connection-change-evidence.js";
import type { UserActorRef } from "@insecur/access";

export interface GateAppConnectionChangeInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly actor: UserActorRef;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly onDenied: (error: HighAssuranceChallengeError) => Promise<void>;
}

async function ensureChallengeRequested(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly actorUserId: UserId;
  readonly requestId: RequestId;
}): Promise<void> {
  await requestHighAssuranceChallenge({
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.appConnectionChange,
    requestingUserId: input.actorUserId,
    request: { requestId: input.requestId },
  });
}

/**
 * Fail closed for App Connection mutations until operation-bound High-Assurance Challenge
 * evidence is consumed.
 */
export async function gateAppConnectionChange(
  input: GateAppConnectionChangeInput,
): Promise<{ operationId: OperationId }> {
  let operationId = input.operationId;
  if (operationId === undefined) {
    const created = await createOperation({
      organizationId: input.organizationId,
      intentCode: OPERATION_INTENT_CODES.appConnectionChange,
    });
    operationId = created.operation.operationId;
    await ensureChallengeRequested({
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId,
      actorUserId: input.actor.userId,
      requestId: input.requestId,
    });
    throw new HighAssuranceHandoffError(operationId);
  }

  try {
    await requireAppConnectionChangeEvidence(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        operationId,
        actor: input.actor,
      },
      input.onDenied,
    );
  } catch (error) {
    if (
      error instanceof HighAssuranceHandoffError ||
      error instanceof HighAssuranceChallengeError
    ) {
      throw error;
    }
    throw new HighAssuranceHandoffError(operationId);
  }

  return { operationId };
}
