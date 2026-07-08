import { buildAncestryKey, detectHarnessFromEnv } from "@insecur/agent-attribution";
import {
  agentSessionId,
  successEnvelope,
  type AgentSessionId,
  type SessionWhoamiData,
} from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import {
  buildAgentSessionStateKey,
  defaultAgentSessionStateStore,
  type AgentSessionStateStore,
} from "../agent-session/persisted-agent-session.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import {
  authRequiredWhoamiEnvelope,
  renderAuthRemediationEnvelope,
} from "../output/auth-remediation.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import { getMemorySession, resolveSessionCredential } from "../session/memory-session.js";
import { defaultSessionStore } from "../session/persisted-session.js";

interface ResolvedSession {
  readonly credential: string;
  readonly sessionId: string;
}

function resolveAgentTag(flags: GlobalCliFlags): string | undefined {
  const fromFlag = flags.agent?.trim();
  if (fromFlag !== undefined && fromFlag !== "") {
    return fromFlag;
  }
  const fromEnv = process.env.INSECUR_AGENT_TAG?.trim();
  return fromEnv === undefined || fromEnv === "" ? undefined : fromEnv;
}

function formatContextLine(data: SessionWhoamiData): string {
  const contextParts: string[] = [];
  if (data.resolvedContext.organizationId !== undefined) {
    contextParts.push(`org=${data.resolvedContext.organizationId}`);
  }
  if (data.resolvedContext.projectId !== undefined) {
    contextParts.push(`project=${data.resolvedContext.projectId}`);
  }
  if (data.resolvedContext.environmentId !== undefined) {
    contextParts.push(`env=${data.resolvedContext.environmentId}`);
  }
  return contextParts.length === 0
    ? "context=(none resolved)"
    : `context=${contextParts.join(" ")}`;
}

function formatAttributionLine(data: SessionWhoamiData): string {
  const attributionParts = [`tier=${data.attribution.tier}`];
  if (data.attribution.harnessName !== undefined) {
    attributionParts.push(`harness=${data.attribution.harnessName}`);
  }
  if (data.attribution.agentSessionId !== undefined) {
    attributionParts.push(`agentSession=${data.attribution.agentSessionId}`);
  }
  if (data.attribution.tag !== undefined) {
    attributionParts.push(`tag=${data.attribution.tag}`);
  }
  return `attribution=${attributionParts.join(" ")}`;
}

function formatWhoamiHuman(data: SessionWhoamiData): string {
  return [
    `actor=${data.userId} session=${data.sessionId}`,
    `sessionValid=${String(data.sessionValid)} expiresAt=${data.sessionExpiresAt}`,
    formatContextLine(data),
    formatAttributionLine(data),
  ].join("\n");
}

function assertMetadataOnlyWhoamiOutput(data: SessionWhoamiData): void {
  const serialized = JSON.stringify(data);
  for (const forbidden of ["credential", "token", "password", "value", "secret", "plaintext"]) {
    if (serialized.toLowerCase().includes(`"${forbidden}"`)) {
      throw new Error(`whoami output must remain metadata-only; found forbidden key ${forbidden}`);
    }
  }
}

async function resolveSession(host: string): Promise<ResolvedSession | undefined> {
  const memory = getMemorySession();
  if (memory !== undefined) {
    return { credential: memory.credential, sessionId: memory.sessionId };
  }
  const persisted = await defaultSessionStore().load(host);
  if (persisted !== undefined) {
    return { credential: persisted.credential, sessionId: persisted.sessionId };
  }
  const credential = resolveSessionCredential();
  if (credential === undefined) {
    return undefined;
  }
  return { credential, sessionId: "unknown" };
}

async function persistRegisteredAgentSession(
  store: AgentSessionStateStore,
  stateKey: string,
  data: SessionWhoamiData,
): Promise<void> {
  if (data.attribution.tier !== "registered") {
    return;
  }
  const agentSessionId = data.attribution.agentSessionId;
  if (agentSessionId === undefined) {
    return;
  }
  await store.save(stateKey, {
    agentSessionId,
    ...(data.attribution.harnessName === undefined
      ? {}
      : { harnessName: data.attribution.harnessName }),
  });
}

function parsePersistedAgentSessionId(raw: string | undefined): AgentSessionId | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = agentSessionId.parse(raw);
  return parsed.ok ? parsed.value : undefined;
}

function buildWhoamiRequest(
  flags: GlobalCliFlags,
  context: ResolvedCliContext,
  session: ResolvedSession,
  persistedAgentSessionId: string | undefined,
) {
  const harnessName = detectHarnessFromEnv(process.env);
  const agentTag = resolveAgentTag(flags);
  const parsedAgentSessionId = parsePersistedAgentSessionId(persistedAgentSessionId);
  return {
    host: context.scope.host,
    bearerCredential: session.credential,
    ...(context.scope.orgId === undefined ? {} : { organizationId: context.scope.orgId }),
    ...(context.scope.projectId === undefined ? {} : { projectId: context.scope.projectId }),
    ...(context.scope.envId === undefined ? {} : { environmentId: context.scope.envId }),
    ...(parsedAgentSessionId === undefined ? {} : { agentSessionId: parsedAgentSessionId }),
    ...(agentTag === undefined ? {} : { agentTag }),
    ...(harnessName === undefined ? {} : { harnessName }),
    ancestryKey: buildAncestryKey(),
  };
}

export async function runWhoamiCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: { readonly agentSessionStateStore?: AgentSessionStateStore } = {},
): Promise<number> {
  const session = await resolveSession(context.scope.host);
  if (session === undefined) {
    renderAuthRemediationEnvelope(authRequiredWhoamiEnvelope(), flags);
    return EXIT_AUTH_REQUIRED;
  }

  const agentSessionStateStore = options.agentSessionStateStore ?? defaultAgentSessionStateStore();
  const stateKey = buildAgentSessionStateKey({
    host: context.scope.host,
    sessionId: session.sessionId,
    parentProcessId: process.ppid,
  });
  const persisted = await agentSessionStateStore.load(stateKey);
  const result = await api.sessionWhoami(
    buildWhoamiRequest(flags, context, session, persisted?.agentSessionId),
  );

  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const data = result.envelope.data;
  assertMetadataOnlyWhoamiOutput(data);
  await persistRegisteredAgentSession(agentSessionStateStore, stateKey, data);
  renderSuccess(successEnvelope(data), flags, formatWhoamiHuman);
  return 0;
}
