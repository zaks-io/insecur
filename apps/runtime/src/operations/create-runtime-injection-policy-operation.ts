import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { createRuntimeInjectionPolicyCommand } from "@insecur/runtime-injection";
import type {
  CreateRuntimeInjectionPolicyRpcInput,
  CreateRuntimeInjectionPolicyRpcPayload,
} from "@insecur/worker-kit";

import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

export interface CreateRuntimeInjectionPolicyOperationInput {
  readonly input: CreateRuntimeInjectionPolicyRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function createRuntimeInjectionPolicyOperation({
  input,
  accessActor,
}: CreateRuntimeInjectionPolicyOperationInput): Promise<CreateRuntimeInjectionPolicyRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  return createRuntimeInjectionPolicyCommand({
    actor: accessActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    displayName: input.displayName,
    command: input.command,
    secretIds: input.secretIds,
    requestId: input.requestId,
    ...(input.commandFingerprint !== undefined
      ? { commandFingerprint: input.commandFingerprint }
      : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
}
