import { resolveEffectiveAccess } from "@insecur/access";
import type { UserActorRef } from "@insecur/access";
import {
  runtimePolicyId,
  runtimePolicyVersionId,
  type DisplayName,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type RuntimePolicyId,
  type SecretId,
} from "@insecur/domain";
import { INJECTION_GRANT_TTL_SECONDS } from "@insecur/runtime-injection-issue";
import { RUNTIME_INJECTION_DELIVERY_MODES } from "@insecur/tenant-store";

import { runPolicyMutationGate } from "./gate-runtime-injection-policy-mutation.js";
import { createAuthorizedRuntimeInjectionPolicy } from "./runtime-injection-policies.js";
import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";
import {
  recordRuntimeInjectionPolicyCreateDenied,
  recordRuntimeInjectionPolicyCreated,
  toPolicyAuditReasonCode,
} from "./record-runtime-injection-policy-audit.js";
import {
  toRuntimeInjectionPolicyVersionRead,
  type RuntimeInjectionPolicyVersionRead,
} from "./runtime-injection-policy-version-read.js";

export interface CreateRuntimeInjectionPolicyCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly policyId: RuntimePolicyId;
  readonly displayName: DisplayName;
  readonly command: string;
  readonly commandFingerprint?: string;
  readonly secretIds: readonly SecretId[];
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export type { RuntimeInjectionPolicyVersionRead };

export interface CreateRuntimeInjectionPolicyResult {
  readonly policyId: RuntimePolicyId;
  readonly policyVersionId: ReturnType<typeof runtimePolicyVersionId.brand>;
  readonly displayName: DisplayName;
  readonly activeVersion: RuntimeInjectionPolicyVersionRead;
  readonly auditEventId: string;
}

export async function createRuntimeInjectionPolicyCommand(
  input: CreateRuntimeInjectionPolicyCommandInput,
): Promise<CreateRuntimeInjectionPolicyResult> {
  const auditScope = await runPolicyMutationGate({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    requestId: input.requestId,
    mode: "create",
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  const effectiveAccess = await resolveEffectiveAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  try {
    return await persistCreatedRuntimeInjectionPolicy(input, auditScope, effectiveAccess);
  } catch (error) {
    await recordRuntimeInjectionPolicyCreateDenied({
      ...auditScope,
      reasonCode:
        error instanceof RuntimeInjectionPolicyError ? error.code : toPolicyAuditReasonCode(error),
      policyId: input.policyId,
    });
    throw error;
  }
}

async function persistCreatedRuntimeInjectionPolicy(
  input: CreateRuntimeInjectionPolicyCommandInput,
  auditScope: Awaited<ReturnType<typeof runPolicyMutationGate>>,
  effectiveAccess: Awaited<ReturnType<typeof resolveEffectiveAccess>>,
): Promise<CreateRuntimeInjectionPolicyResult> {
  const policyVersionIdValue = runtimePolicyVersionId.generate();
  const created = await createAuthorizedRuntimeInjectionPolicy({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    policyVersionId: policyVersionIdValue,
    displayName: input.displayName,
    version: {
      secretIds: input.secretIds,
      variableKeys: [],
      command: input.command,
      ...(input.commandFingerprint !== undefined
        ? { commandFingerprint: input.commandFingerprint }
        : {}),
      ttlSeconds: INJECTION_GRANT_TTL_SECONDS,
      deliveryMode: RUNTIME_INJECTION_DELIVERY_MODES.environmentVariables,
    },
    effectiveAccess,
    accessCoordinate: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
  });

  const audit = await recordRuntimeInjectionPolicyCreated({
    ...auditScope,
    policyId: created.policy.policyId,
    policyVersionId: created.activeVersion.policyVersionId,
  });

  return {
    policyId: runtimePolicyId.brand(created.policy.policyId),
    policyVersionId: created.activeVersion.policyVersionId,
    displayName: input.displayName,
    activeVersion: toRuntimeInjectionPolicyVersionRead(created.activeVersion),
    auditEventId: audit.auditEventId,
  };
}
