import type {
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  RuntimePolicyId,
  UserId,
} from "@insecur/domain";
import type { EnvironmentId } from "@insecur/domain";
import {
  HighAssuranceChallengeError,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  protectedEnvironmentMutationGateInput,
  runProtectedEnvironmentMutationGate,
} from "@insecur/high-assurance";
import { OPERATION_INTENT_CODES } from "@insecur/operations";

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
  readonly policyId?: RuntimePolicyId;
  readonly onDenied: (error: HighAssuranceChallengeError) => Promise<void>;
}

/**
 * Fail closed for Protected Environment policy mutations until operation-bound
 * High-Assurance Challenge evidence is consumed.
 */
export async function gateProtectedRuntimeInjectionPolicyChange(
  input: GateProtectedPolicyChangeInput,
): Promise<{ operationId?: OperationId }> {
  return runProtectedEnvironmentMutationGate(
    protectedEnvironmentMutationGateInput(
      input,
      {
        intentCode: OPERATION_INTENT_CODES.runtimeInjectionPolicyChange,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy,
      },
      (operationId) =>
        requireRuntimeInjectionPolicyChangeEvidence(
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            environmentId: input.environmentId,
            operationId,
            actor: { type: "user", userId: input.actorUserId },
          },
          input.onDenied,
        ),
    ),
  );
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
    policyId: input.policyId,
    reasonCode: input.reasonCode,
  });
}
