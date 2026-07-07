import { resolveEffectiveAccess } from "@insecur/access";
import type { UserActorRef } from "@insecur/access";
import {
  type DisplayName,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type RuntimePolicyId,
} from "@insecur/domain";
import {
  TenantRuntimeInjectionPolicyStore,
  toIsoTimestamp,
  withTenantScope,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionPolicyConfigureAccess } from "./assert-runtime-injection-policy-access.js";
import { runPolicyMutationGate } from "./gate-runtime-injection-policy-mutation.js";
import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";
import type { RuntimeInjectionPolicyVersionRead } from "./create-runtime-injection-policy-command.js";
import {
  recordRuntimeInjectionPolicyDisableDenied,
  recordRuntimeInjectionPolicyDisabled,
  toPolicyAuditReasonCode,
} from "./record-runtime-injection-policy-audit.js";
import { toRuntimeInjectionPolicyVersionRead } from "./runtime-injection-policy-version-read.js";

export interface DisableRuntimeInjectionPolicyCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly policyId: RuntimePolicyId;
  readonly comment: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface DisableRuntimeInjectionPolicyResult {
  readonly policyId: RuntimePolicyId;
  readonly disabledAt: string;
  readonly auditEventId: string;
}

export interface RuntimeInjectionPolicyShowResult {
  readonly policyId: RuntimePolicyId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly displayName: DisplayName;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly activeVersion: RuntimeInjectionPolicyVersionRead | null;
}

export async function getRuntimeInjectionPolicyShow(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly policyId: RuntimePolicyId;
}): Promise<RuntimeInjectionPolicyShowResult> {
  const effectiveAccess = await resolveEffectiveAccess(input.actor, {
    organizationId: input.organizationId,
  });

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantRuntimeInjectionPolicyStore(db);
      const policy = await store.getPolicyById(input.organizationId, input.policyId);
      if (!policy) {
        throw new RuntimeInjectionPolicyError(
          "runtime_policy.not_found",
          "runtime injection policy not found",
        );
      }

      assertRuntimeInjectionPolicyConfigureAccess(
        {
          organizationId: policy.organizationId,
          projectId: policy.projectId,
          environmentId: policy.environmentId,
        },
        effectiveAccess,
        {
          organizationId: policy.organizationId,
          projectId: policy.projectId,
          environmentId: policy.environmentId,
        },
      );

      const activeVersion = policy.activeVersionId
        ? await store.getActiveVersion(input.organizationId, input.policyId)
        : null;

      return {
        policyId: policy.policyId,
        organizationId: policy.organizationId,
        projectId: policy.projectId,
        environmentId: policy.environmentId,
        displayName: policy.displayName,
        disabledAt: policy.disabledAt ? toIsoTimestamp(policy.disabledAt) : null,
        createdAt: toIsoTimestamp(policy.createdAt),
        activeVersion: activeVersion ? toRuntimeInjectionPolicyVersionRead(activeVersion) : null,
      };
    },
  );
}

export async function disableRuntimeInjectionPolicyCommand(
  input: DisableRuntimeInjectionPolicyCommandInput,
): Promise<DisableRuntimeInjectionPolicyResult> {
  const auditScope = await runPolicyMutationGate({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    requestId: input.requestId,
    mode: "disable",
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  const effectiveAccess = await resolveEffectiveAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  assertRuntimeInjectionPolicyConfigureAccess(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
    effectiveAccess,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
  );

  try {
    return await persistDisabledRuntimeInjectionPolicy(input, auditScope);
  } catch (error) {
    await recordRuntimeInjectionPolicyDisableDenied({
      ...auditScope,
      policyId: input.policyId,
      reasonCode: toPolicyAuditReasonCode(error),
    });
    throw error;
  }
}

async function persistDisabledRuntimeInjectionPolicy(
  input: DisableRuntimeInjectionPolicyCommandInput,
  auditScope: Awaited<ReturnType<typeof runPolicyMutationGate>>,
): Promise<DisableRuntimeInjectionPolicyResult> {
  const disabledAt = new Date();
  const policy = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantRuntimeInjectionPolicyStore(db);
      return store.disablePolicy(input.organizationId, input.policyId, disabledAt);
    },
  );

  const audit = await recordRuntimeInjectionPolicyDisabled({
    ...auditScope,
    policyId: input.policyId,
    comment: input.comment,
  });

  return {
    policyId: policy.policyId,
    disabledAt: toIsoTimestamp(policy.disabledAt ?? disabledAt),
    auditEventId: audit.auditEventId,
  };
}
