import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { getRuntimeInjectionPolicyShow } from "@insecur/runtime-injection";
import type {
  GetRuntimeInjectionPolicyRpcInput,
  GetRuntimeInjectionPolicyRpcPayload,
} from "@insecur/worker-kit";

import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

export interface GetRuntimeInjectionPolicyOperationInput {
  readonly input: GetRuntimeInjectionPolicyRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function getRuntimeInjectionPolicyOperation({
  input,
  accessActor,
}: GetRuntimeInjectionPolicyOperationInput): Promise<GetRuntimeInjectionPolicyRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  return getRuntimeInjectionPolicyShow({
    actor: accessActor,
    organizationId: input.organizationId,
    policyId: input.policyId,
  });
}
