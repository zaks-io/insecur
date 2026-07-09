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
import { isLocalModeHost, LOCAL_MODE_HOST } from "../config/local-mode.js";
import { renderSuccess } from "../output/render.js";
import {
  formatLocalWhoamiHuman,
  formatWhoamiHuman,
  type LocalWhoamiData,
} from "../output/whoami-detail.js";
import { getMemorySession, resolveSessionCredential } from "../session/memory-session.js";
import { defaultSessionStore } from "../session/persisted-session.js";
import { resolveAgentCredentialFromEnv } from "../auth/agent-credential-store.js";

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
  const fromEnv = resolveSessionCredential();
  if (fromEnv !== undefined) {
    return { credential: fromEnv, sessionId: "unknown" };
  }
  const fromAgentFile = await resolveAgentCredentialFromEnv(host);
  if (fromAgentFile !== undefined) {
    return { credential: fromAgentFile, sessionId: "unknown" };
  }
  const persisted = await defaultSessionStore().load(host);
  if (persisted !== undefined) {
    return { credential: persisted.credential, sessionId: persisted.sessionId };
  }
  return undefined;
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

function renderLocalWhoami(flags: GlobalCliFlags, context: ResolvedCliContext): number {
  const data: LocalWhoamiData = {
    mode: "local",
    host: LOCAL_MODE_HOST,
    ...(context.scope.projectId === undefined ? {} : { projectId: context.scope.projectId }),
    ...(context.scope.envId === undefined ? {} : { environmentId: context.scope.envId }),
    ...(context.scope.profileId === undefined ? {} : { profileId: context.scope.profileId }),
  };
  renderSuccess(successEnvelope(data), flags, formatLocalWhoamiHuman);
  return 0;
}

export async function runWhoamiCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: { readonly agentSessionStateStore?: AgentSessionStateStore } = {},
): Promise<number> {
  if (isLocalModeHost(context.scope.host)) {
    return renderLocalWhoami(flags, context);
  }

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
  const data = await fetchWhoamiData({
    flags,
    api,
    context,
    session,
    agentSessionStateStore,
    stateKey,
  });
  await persistRegisteredAgentSession(agentSessionStateStore, stateKey, data);
  renderSuccess(successEnvelope(data), flags, formatWhoamiHuman);
  return 0;
}

async function fetchWhoamiData(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly session: ResolvedSession;
  readonly agentSessionStateStore: AgentSessionStateStore;
  readonly stateKey: string;
}): Promise<SessionWhoamiData> {
  const persisted = await input.agentSessionStateStore.load(input.stateKey);
  const result = await input.api.sessionWhoami(
    buildWhoamiRequest(input.flags, input.context, input.session, persisted?.agentSessionId),
  );
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }
  assertMetadataOnlyWhoamiOutput(result.envelope.data);
  return result.envelope.data;
}
