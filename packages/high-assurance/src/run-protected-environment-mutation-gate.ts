import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import { isProtectedEnvironment } from "@insecur/tenant-store";

import {
  consumeEvidenceOrThrowHandoff,
  requestProtectedEnvironmentMutationHandoff,
} from "./protected-environment-mutation-handoff.js";

function assertDefinedOperationId(
  operationId: OperationId | undefined,
): asserts operationId is OperationId {
  if (operationId === undefined) {
    throw new Error("Protected environment mutation requires an operation id.");
  }
}

export interface ProtectedEnvironmentMutationGateScope {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserId;
  readonly requestId: RequestId;
  readonly operationId?: OperationId;
}

export function protectedEnvironmentMutationGateInput(
  input: ProtectedEnvironmentMutationGateScope,
  config: {
    readonly intentCode: string;
    readonly riskReasonCode: string;
  },
  consumeEvidence: (operationId: OperationId) => Promise<void>,
) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    intentCode: config.intentCode,
    riskReasonCode: config.riskReasonCode,
    consumeEvidence,
  };
}

export async function runProtectedEnvironmentMutationGate(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserId;
  readonly requestId: RequestId;
  readonly operationId?: OperationId;
  readonly intentCode: string;
  readonly riskReasonCode: string;
  readonly consumeEvidence: (operationId: OperationId) => Promise<void>;
}): Promise<{ operationId?: OperationId }> {
  const protectedEnvironment = await isProtectedEnvironment(
    input.organizationId,
    input.environmentId,
  );
  if (!protectedEnvironment) {
    return {};
  }

  const operationId = input.operationId;
  if (operationId === undefined) {
    await requestProtectedEnvironmentMutationHandoff({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      intentCode: input.intentCode,
      riskReasonCode: input.riskReasonCode,
    });
  }
  assertDefinedOperationId(operationId);

  await consumeEvidenceOrThrowHandoff(operationId, () => input.consumeEvidence(operationId));

  return { operationId };
}
