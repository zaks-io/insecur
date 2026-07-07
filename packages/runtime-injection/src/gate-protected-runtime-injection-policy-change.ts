import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import {
  HighAssuranceHandoffError,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  requestHighAssuranceChallenge,
  type HighAssuranceChallengeError,
} from "@insecur/high-assurance";
import { createOperation, OPERATION_INTENT_CODES } from "@insecur/operations";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";

import { requireRuntimeInjectionPolicyChangeEvidence } from "./consume-runtime-injection-policy-change-evidence.js";
import {
  recordRuntimeInjectionPolicyCreateDenied,
  recordRuntimeInjectionPolicyDisableDenied,
} from "./record-runtime-injection-policy-audit.js";

export interface GateProtectedPolicyChangeInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserId;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly policyId?: string;
  readonly onDenied: (error: HighAssuranceChallengeError) => Promise<void>;
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
  readonly requestId: RequestId;
}): Promise<void> {
  await requestHighAssuranceChallenge({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    operationId: input.operationId,
    riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy,
    requestingUserId: input.actorUserId,
    request: { requestId: input.requestId },
  });
}

/**
 * Fail closed for Protected Environment policy mutations until operation-bound
 * High-Assurance Challenge evidence is consumed.
 */
export async function gateProtectedRuntimeInjectionPolicyChange(
  input: GateProtectedPolicyChangeInput,
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
      intentCode: OPERATION_INTENT_CODES.runtimeInjectionPolicyChange,
    });
    operationId = created.operation.operationId;
    await ensureChallengeRequested({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      operationId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
    throw new HighAssuranceHandoffError(operationId);
  }

  try {
    await requireRuntimeInjectionPolicyChangeEvidence(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        operationId,
        actor: { type: "user", userId: input.actorUserId },
      },
      input.onDenied,
    );
  } catch (error) {
    if (error instanceof HighAssuranceHandoffError) {
      throw error;
    }
    throw new HighAssuranceHandoffError(operationId);
  }

  return { operationId };
}

export async function recordProtectedPolicyChangeDenied(
  input: GateProtectedPolicyChangeInput & {
    readonly mode: "create" | "disable";
    readonly reasonCode: string;
  },
): Promise<void> {
  const scope = {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    request: { requestId: input.requestId },
  };
  if (input.mode === "create") {
    await recordRuntimeInjectionPolicyCreateDenied({
      ...scope,
      reasonCode: input.reasonCode,
    });
    return;
  }
  if (input.policyId === undefined) {
    return;
  }
  await recordRuntimeInjectionPolicyDisableDenied({
    ...scope,
    policyId: input.policyId as never,
    reasonCode: input.reasonCode,
  });
}
