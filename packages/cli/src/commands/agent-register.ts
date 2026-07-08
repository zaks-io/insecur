import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { ApiClient } from "../api/types.js";
import {
  buildAgentSessionStateKey,
  defaultAgentSessionStateStore,
  type AgentSessionStateStore,
} from "../agent-session/persisted-agent-session.js";
import { buildRegisterRequest } from "./agent-shared.js";
import { requireHumanSessionCredential } from "./agent-shared.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { successEnvelope } from "@insecur/domain";
import { getMemorySession } from "../session/memory-session.js";
import { defaultSessionStore } from "../session/persisted-session.js";

async function resolveSessionId(host: string): Promise<string> {
  const memory = getMemorySession();
  if (memory !== undefined) {
    return memory.sessionId;
  }
  const persisted = await defaultSessionStore().load(host);
  if (persisted !== undefined) {
    return persisted.sessionId;
  }
  return "unknown";
}

function formatRegisterHuman(data: { agentSessionId: string; harnessName: string }): string {
  return `Registered agent session ${data.agentSessionId} (${data.harnessName}).`;
}

export async function runAgentRegisterCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: { readonly agentSessionStateStore?: AgentSessionStateStore } = {},
): Promise<number> {
  const humanCredential = await requireHumanSessionCredential(context.scope.host);
  const { harnessName, ancestryKey } = buildRegisterRequest(flags);
  const result = await api.registerAgentSession({
    host: context.scope.host,
    bearerCredential: humanCredential,
    harnessName,
    ancestryKey,
  });
  if (!result.ok) {
    throw new CliError(result.envelope.error);
  }
  const data = result.envelope.data;
  const store = options.agentSessionStateStore ?? defaultAgentSessionStateStore();
  const sessionId = await resolveSessionId(context.scope.host);
  await store.save(
    buildAgentSessionStateKey({
      host: context.scope.host,
      sessionId,
      parentProcessId: process.ppid,
    }),
    { agentSessionId: data.agentSessionId, harnessName: data.harnessName },
  );
  renderSuccess(successEnvelope(data), flags, formatRegisterHuman);
  return 0;
}
