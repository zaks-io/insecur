import type { UserActorRef } from "@insecur/access";
import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  RuntimePolicyId,
  UserId,
} from "@insecur/domain";
import type { HighAssuranceChallengeError } from "@insecur/high-assurance";

import {
  gateProtectedRuntimeInjectionPolicyChange,
  recordProtectedPolicyChangeDenied,
} from "./gate-protected-runtime-injection-policy-change.js";
import { onPolicyMutationGateFailure } from "./on-policy-mutation-gate-failure.js";
import {
  recordRuntimeInjectionPolicyCreateDenied,
  recordRuntimeInjectionPolicyDisableDenied,
  toPolicyAuditReasonCode,
} from "./record-runtime-injection-policy-audit.js";

interface PolicyMutationAuditScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly request: { requestId: RequestId };
}

interface PolicyMutationCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly policyId: RuntimePolicyId;
  readonly requestId: RequestId;
  readonly operationId?: OperationId;
}

function buildPolicyMutationAuditScope(
  input: PolicyMutationCommandInput,
): PolicyMutationAuditScope {
  return {
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    request: { requestId: input.requestId },
  };
}

export async function runPolicyMutationGate(
  input: PolicyMutationCommandInput & { readonly mode: "create" | "disable" },
): Promise<PolicyMutationAuditScope> {
  const auditScope = buildPolicyMutationAuditScope(input);
  await gateActorRuntimeInjectionPolicyMutation({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    requestId: input.requestId,
    mode: input.mode,
    auditScope,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
  return auditScope;
}

async function gateActorRuntimeInjectionPolicyMutation(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly policyId: RuntimePolicyId;
  readonly requestId: RequestId;
  readonly mode: "create" | "disable";
  readonly operationId?: OperationId;
  readonly auditScope: PolicyMutationAuditScope;
}): Promise<void> {
  try {
    await gateProtectedRuntimeInjectionPolicyChange({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorUserId: input.actor.userId,
      requestId: input.requestId,
      policyId: input.policyId,
      ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      onDenied: async (error: HighAssuranceChallengeError) => {
        await recordProtectedPolicyChangeDenied({
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          actorUserId: input.actor.userId,
          requestId: input.requestId,
          mode: input.mode,
          reasonCode: error.code,
          policyId: input.policyId,
          ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
          onDenied: () => Promise.resolve(),
        });
      },
    });
  } catch (error) {
    await onPolicyMutationGateFailure(error, async () => {
      const denied = {
        ...input.auditScope,
        policyId: input.policyId,
        reasonCode: toPolicyAuditReasonCode(error),
      };
      if (input.mode === "create") {
        await recordRuntimeInjectionPolicyCreateDenied(denied);
        return;
      }
      await recordRuntimeInjectionPolicyDisableDenied(denied);
    });
  }
}
