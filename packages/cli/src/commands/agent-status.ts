import { detectHarnessFromEnv } from "@insecur/agent-attribution";
import { successEnvelope, type NextAction } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { isLocalModeHost } from "../config/local-mode.js";
import { tryResolveSessionCredential } from "../auth/try-session.js";
import { CLI_ENVELOPE_SCHEMA_VERSION } from "../output/render.js";
import { renderSuccess } from "../output/render.js";
import { cliVersion } from "../version.js";

const LOCAL_CAPABILITIES = [
  "scan",
  "guide",
  "secrets:list",
  "secrets:set",
  "run:variable-key",
] as const;

const HOSTED_CLIENT_CAPABILITIES = [
  "scan",
  "guide",
  "secrets:list",
  "secrets:set",
  "run:variable-key",
  "run:policy",
  "operations",
] as const;

interface AgentStatusFacts {
  readonly local: boolean;
  readonly configured: boolean;
  readonly authenticated: boolean;
  readonly harnessName: string | undefined;
  readonly tag: string | undefined;
}

function nextActions(input: {
  readonly local: boolean;
  readonly configured: boolean;
  readonly authenticated: boolean;
}): readonly NextAction[] {
  if (!input.configured) {
    return [
      {
        id: "initialize-project",
        actor: "agent",
        kind: "execute",
        argv: ["insecur", "init", ...(input.local ? ["--host", "local"] : []), "--json"],
      },
    ];
  }
  if (!input.local && !input.authenticated) {
    return [
      {
        id: "authenticate",
        actor: "human",
        kind: "execute",
        argv: ["insecur", "login", "--device", "--agent-session"],
      },
    ];
  }
  return [
    {
      id: "list-secrets",
      actor: "agent",
      kind: "execute",
      argv: ["insecur", "secrets", "list", "--json"],
    },
  ];
}

async function resolveStatusFacts(
  flags: GlobalCliFlags,
  context: ResolvedCliContext,
): Promise<AgentStatusFacts> {
  const local = isLocalModeHost(context.scope.host);
  const authenticated = local
    ? false
    : (await tryResolveSessionCredential(context.scope.host)) !== undefined;
  return {
    local,
    authenticated,
    configured: context.projectConfig !== null,
    harnessName: detectHarnessFromEnv(process.env),
    tag: flags.agent ?? process.env.INSECUR_AGENT_TAG,
  };
}

function statusContext(context: ResolvedCliContext, configured: boolean) {
  return {
    host: context.scope.host,
    configured,
    ...(context.scope.orgId === undefined ? {} : { organizationId: context.scope.orgId }),
    ...(context.scope.projectId === undefined ? {} : { projectId: context.scope.projectId }),
    ...(context.scope.envId === undefined ? {} : { environmentId: context.scope.envId }),
    ...(context.scope.profileId === undefined ? {} : { profileId: context.scope.profileId }),
    ...(context.scope.profileSlug === undefined ? {} : { profileSlug: context.scope.profileSlug }),
  };
}

function statusAttribution(facts: AgentStatusFacts) {
  return {
    status:
      facts.harnessName === undefined && facts.tag === undefined
        ? ("none" as const)
        : ("detected" as const),
    ...(facts.harnessName === undefined ? {} : { harnessName: facts.harnessName }),
    ...(facts.tag === undefined ? {} : { tag: facts.tag }),
  };
}

function statusCapabilities(facts: AgentStatusFacts) {
  if (facts.local) {
    return { available: LOCAL_CAPABILITIES, authority: "local_project" as const };
  }
  return {
    available: HOSTED_CLIENT_CAPABILITIES,
    authority: facts.authenticated ? ("server_enforced" as const) : ("unavailable" as const),
  };
}

function missingPrerequisites(facts: AgentStatusFacts): readonly string[] {
  const missing = facts.configured ? [] : ["project_config"];
  if (!facts.local && !facts.authenticated) {
    missing.push("authentication");
  }
  return missing;
}

function buildStatusData(context: ResolvedCliContext, facts: AgentStatusFacts) {
  return {
    cliVersion: cliVersion(),
    envelopeSchemaVersion: CLI_ENVELOPE_SCHEMA_VERSION,
    mode: facts.local ? ("local" as const) : ("hosted" as const),
    context: statusContext(context, facts.configured),
    session: facts.local
      ? ({ status: "not_required" as const } as const)
      : ({ status: facts.authenticated ? ("present" as const) : ("missing" as const) } as const),
    attribution: statusAttribution(facts),
    capabilities: statusCapabilities(facts),
    missingPrerequisites: missingPrerequisites(facts),
  };
}

export async function runAgentStatusCommand(
  flags: GlobalCliFlags,
  context: ResolvedCliContext,
): Promise<number> {
  const facts = await resolveStatusFacts(flags, context);
  const data = buildStatusData(context, facts);
  renderSuccess(
    successEnvelope(data, undefined, nextActions(facts)),
    flags,
    () =>
      `Agent status: ${data.mode}; ${facts.configured ? "configured" : "not initialized"}; session ${data.session.status}.`,
  );
  return 0;
}
