import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef, UserActorRef } from "@insecur/access";
import type {
  AppConnectionId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import type { HighAssuranceChallengeError } from "@insecur/high-assurance";

import { gateAppConnectionChange } from "./gate-app-connection-change.js";
import { onAppConnectionChangeGateFailure } from "./on-app-connection-change-gate-failure.js";
import { orgScopedConnectionProjectId } from "./org-scoped-connection-project-id.js";
import {
  recordConnectionCreateDenied,
  recordConnectionCredentialAttachDenied,
  toConnectionAuditReasonCode,
} from "./record-connection-audit.js";

export interface AppConnectionChangeGateInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly requestId: RequestId;
  readonly operationId?: OperationId;
  readonly onDenied?: (error: HighAssuranceChallengeError) => Promise<void>;
}

type AppConnectionDeniedAudit =
  | { readonly kind: "create" }
  | { readonly kind: "credentialAttach"; readonly appConnectionId: AppConnectionId };

async function runAppConnectionChangeGateInternal(
  input: AppConnectionChangeGateInput,
  deniedAudit: AppConnectionDeniedAudit,
): Promise<{ operationId: OperationId; projectId: ProjectId }> {
  const projectId = orgScopedConnectionProjectId();
  const recordDenied = async (reasonCode: string) => {
    if (deniedAudit.kind === "create") {
      await recordConnectionCreateDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId,
        reasonCode,
      });
      return;
    }
    await recordConnectionCredentialAttachDenied({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId,
      appConnectionId: deniedAudit.appConnectionId,
      reasonCode,
    });
  };

  try {
    const gate = await gateAppConnectionChange({
      organizationId: input.organizationId,
      projectId,
      actor: input.actor,
      requestId: input.requestId,
      ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      onDenied:
        input.onDenied ??
        (async (error) => {
          await recordDenied(error.code);
        }),
    });
    return { operationId: gate.operationId, projectId };
  } catch (error) {
    await onAppConnectionChangeGateFailure(error, async () => {
      await recordDenied(toConnectionAuditReasonCode(error));
    });
    throw error;
  }
}

export async function runAppConnectionChangeGate(
  input: AppConnectionChangeGateInput,
): Promise<{ operationId: OperationId; projectId: ProjectId }> {
  return runAppConnectionChangeGateInternal(input, { kind: "create" });
}

export function requireUserActorForConnectionCommand(actor: ActorRef): UserActorRef {
  if (actor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  return actor;
}

export async function beginAppConnectionChangeCommand(input: {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly requestId: RequestId;
  readonly operationId?: OperationId;
}): Promise<{
  readonly actor: UserActorRef;
  readonly gate: { readonly operationId: OperationId; readonly projectId: ProjectId };
}> {
  const actor = requireUserActorForConnectionCommand(input.actor);
  const gate = await runAppConnectionChangeGate({
    actor,
    organizationId: input.organizationId,
    requestId: input.requestId,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
  return { actor, gate };
}

export async function runAppConnectionCredentialChangeGate(
  input: AppConnectionChangeGateInput & {
    readonly appConnectionId: AppConnectionId;
  },
): Promise<{ operationId: OperationId; projectId: ProjectId }> {
  return runAppConnectionChangeGateInternal(input, {
    kind: "credentialAttach",
    appConnectionId: input.appConnectionId,
  });
}
