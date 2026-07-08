import { registerAgentSession } from "@insecur/agent-attribution";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type {
  RegisterAgentSessionRpcInput,
  RegisterAgentSessionRpcPayload,
} from "@insecur/worker-kit";

import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

export async function registerAgentSessionOperation(
  input: RegisterAgentSessionRpcInput,
  actors: RuntimeRpcActorContext,
): Promise<RegisterAgentSessionRpcPayload> {
  if (actors.accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  const harnessName = input.harnessName.trim();
  const ancestryKey = input.ancestryKey.trim();
  if (harnessName === "" || ancestryKey === "") {
    throw Object.assign(new Error("harnessName and ancestryKey are required."), {
      code: "validation.invalid_command_input",
    });
  }
  const agentSessionId = await registerAgentSession({
    humanSessionId: actors.actor.sessionId,
    userId: actors.actor.userId,
    harnessName,
    ancestryKey,
  });
  return { agentSessionId, harnessName };
}
