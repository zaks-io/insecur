import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  RuntimeInjectionPolicyError,
  disableRuntimeInjectionPolicyCommand,
} from "@insecur/runtime-injection";
import { TenantRuntimeInjectionPolicyStore, withTenantScope } from "@insecur/tenant-store";
import type {
  DisableRuntimeInjectionPolicyRpcInput,
  DisableRuntimeInjectionPolicyRpcPayload,
} from "@insecur/worker-kit";

import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

export interface DisableRuntimeInjectionPolicyOperationInput {
  readonly input: DisableRuntimeInjectionPolicyRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

async function assertPolicyCoordinateMatches(
  input: DisableRuntimeInjectionPolicyRpcInput,
): Promise<void> {
  const policy = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantRuntimeInjectionPolicyStore(db);
      return store.getPolicyById(input.organizationId, input.policyId);
    },
  );
  if (!policy) {
    throw new RuntimeInjectionPolicyError(
      "runtime_policy.not_found",
      "runtime injection policy not found",
    );
  }
  if (policy.projectId !== input.projectId || policy.environmentId !== input.environmentId) {
    throw new RuntimeInjectionPolicyError(
      "runtime_policy.not_found",
      "runtime injection policy not found in the requested project or environment",
    );
  }
}

export async function disableRuntimeInjectionPolicyOperation({
  input,
  accessActor,
}: DisableRuntimeInjectionPolicyOperationInput): Promise<DisableRuntimeInjectionPolicyRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  await assertPolicyCoordinateMatches(input);

  return disableRuntimeInjectionPolicyCommand({
    actor: accessActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    comment: input.comment,
    requestId: input.requestId,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
}
