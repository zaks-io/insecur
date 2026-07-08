import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import {
  HighAssuranceChallengeError,
  HighAssuranceHandoffError,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  requestHighAssuranceChallenge,
} from "@insecur/high-assurance";
import { createOperation, OPERATION_INTENT_CODES } from "@insecur/operations";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";

import { consumeProtectedSecretMutationEvidence } from "./consume-protected-secret-mutation-evidence.js";

export type ProtectedSecretMutationKind = "promotion" | "rollback";

export interface GateProtectedSecretMutationInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserId;
  readonly mutationKind: ProtectedSecretMutationKind;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly onDenied: (error: HighAssuranceChallengeError) => Promise<void>;
}

function riskReasonForMutation(kind: ProtectedSecretMutationKind): string {
  return kind === "promotion"
    ? HIGH_ASSURANCE_RISK_REASON_CODES.protectedPromotion
    : HIGH_ASSURANCE_RISK_REASON_CODES.protectedRollback;
}

function intentForMutation(kind: ProtectedSecretMutationKind): string {
  return kind === "promotion"
    ? OPERATION_INTENT_CODES.protectedPromotionRequest
    : OPERATION_INTENT_CODES.protectedRollbackRequest;
}

async function isProtectedEnvironment(
  organizationId: OrganizationId,
  environmentId: EnvironmentId,
): Promise<boolean> {
  return withTenantScope({ kind: "organization", organizationId }, async ({ db }) => {
    const store = new TenantEnvironmentLifecycleStore(db);
    const environment = await store.getById(organizationId, environmentId);
    return environment?.isProtected === true;
  });
}

async function ensureChallengeRequested(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly operationId: OperationId;
  readonly actorUserId: UserId;
  readonly mutationKind: ProtectedSecretMutationKind;
  readonly requestId: RequestId;
}): Promise<void> {
  await requestHighAssuranceChallenge({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    operationId: input.operationId,
    riskReasonCode: riskReasonForMutation(input.mutationKind),
    requestingUserId: input.actorUserId,
    request: { requestId: input.requestId },
  });
}

async function consumeEvidenceOrHandoff(
  input: GateProtectedSecretMutationInput,
  operationId: OperationId,
): Promise<void> {
  try {
    await consumeProtectedSecretMutationEvidence(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        operationId,
        actorUserId: input.actorUserId,
        mutationKind: input.mutationKind,
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
}

export async function gateProtectedSecretMutation(
  input: GateProtectedSecretMutationInput,
): Promise<{ operationId?: OperationId }> {
  const protectedEnvironment = await isProtectedEnvironment(
    input.organizationId,
    input.environmentId,
  );
  if (!protectedEnvironment) {
    return {};
  }

  let operationId = input.operationId;
  if (operationId === undefined) {
    const created = await createOperation({
      organizationId: input.organizationId,
      intentCode: intentForMutation(input.mutationKind),
    });
    operationId = created.operation.operationId;
    await ensureChallengeRequested({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      operationId,
      actorUserId: input.actorUserId,
      mutationKind: input.mutationKind,
      requestId: input.requestId,
    });
    throw new HighAssuranceHandoffError(operationId);
  }

  await consumeEvidenceOrHandoff(input, operationId);

  return { operationId };
}
