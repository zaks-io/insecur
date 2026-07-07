import { resolveSessionWhoami, type ResolveSessionWhoamiInput } from "@insecur/agent-attribution";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type {
  ResolveSessionWhoamiRpcInput,
  ResolveSessionWhoamiRpcPayload,
} from "@insecur/worker-kit";

import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

function contextRpcFields(
  input: ResolveSessionWhoamiRpcInput,
): Pick<
  ResolveSessionWhoamiInput,
  "organizationId" | "projectId" | "environmentId" | "derivedAgentSessionId"
> {
  return {
    ...(input.derivedAgentSessionId !== undefined
      ? { derivedAgentSessionId: input.derivedAgentSessionId }
      : {}),
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
  };
}

function attributionRpcFields(
  input: ResolveSessionWhoamiRpcInput,
): Pick<ResolveSessionWhoamiInput, "agentSessionId" | "agentTag" | "harnessName" | "ancestryKey"> {
  return {
    ...(input.agentSessionId !== undefined ? { agentSessionId: input.agentSessionId } : {}),
    ...(input.agentTag !== undefined ? { agentTag: input.agentTag } : {}),
    ...(input.harnessName !== undefined ? { harnessName: input.harnessName } : {}),
    ...(input.ancestryKey !== undefined ? { ancestryKey: input.ancestryKey } : {}),
  };
}

export async function resolveSessionWhoamiOperation(
  input: ResolveSessionWhoamiRpcInput,
  actors: RuntimeRpcActorContext,
): Promise<ResolveSessionWhoamiRpcPayload> {
  if (actors.accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  return resolveSessionWhoami({
    userId: actors.actor.userId,
    sessionId: actors.actor.sessionId,
    sessionExpiresAt: input.sessionExpiresAt,
    agentMarked: input.agentMarked,
    ...contextRpcFields(input),
    ...attributionRpcFields(input),
  });
}
