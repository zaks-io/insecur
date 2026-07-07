import {
  pickWhoamiAttributionFields,
  pickWhoamiContextFields,
  resolveSessionWhoami,
} from "@insecur/agent-attribution";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type {
  ResolveSessionWhoamiRpcInput,
  ResolveSessionWhoamiRpcPayload,
} from "@insecur/worker-kit";

import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

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
    ...pickWhoamiContextFields(input),
    ...pickWhoamiAttributionFields(input),
  });
}
