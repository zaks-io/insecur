import { buildAncestryKey, detectHarnessFromEnv } from "@insecur/agent-attribution";
import type { DeriveAgentSessionData } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CLI_AGENT_CREDENTIAL_FILE_ENV, CLI_AGENT_TAG_ENV } from "../auth/agent-env-keys.js";
import { CLI_SESSION_TOKEN_ENV, buildCliChildEnv } from "../auth/child-env.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { CliError } from "../output/cli-error.js";
import {
  credentialScopesForCapabilities,
  type AgentSessionPolicyOptions,
} from "./agent-session-policy.js";

export interface DerivedAgentSession {
  readonly credential: string;
  readonly data: DeriveAgentSessionData;
}

type ScopedAgentSessionOptions = AgentSessionPolicyOptions & {
  readonly organizationId?: ResolvedCliContext["scope"]["orgId"];
  readonly projectId?: ResolvedCliContext["scope"]["projectId"];
  readonly environmentId?: ResolvedCliContext["scope"]["envId"];
};

export function bindAgentSessionPolicyToContext(
  policy: AgentSessionPolicyOptions,
  context: ResolvedCliContext,
): ScopedAgentSessionOptions {
  if (policy.allow === undefined) {
    return policy;
  }
  return {
    ...policy,
    ...(context.scope.orgId === undefined ? {} : { organizationId: context.scope.orgId }),
    ...(context.scope.projectId === undefined ? {} : { projectId: context.scope.projectId }),
    ...(context.scope.envId === undefined ? {} : { environmentId: context.scope.envId }),
  };
}

export function resolveAgentTag(flags: GlobalCliFlags): string | undefined {
  const fromFlag = flags.agent?.trim();
  if (fromFlag !== undefined && fromFlag !== "") {
    return fromFlag;
  }
  const fromEnv = process.env[CLI_AGENT_TAG_ENV]?.trim();
  return fromEnv === undefined || fromEnv === "" ? undefined : fromEnv;
}

function resolveHarnessName(): string | undefined {
  return detectHarnessFromEnv(process.env);
}

function buildDerivedSessionRequest(
  host: string,
  humanCredential: string,
  options: ScopedAgentSessionOptions,
) {
  const harnessName = resolveHarnessName();
  const credentialScopes = credentialScopesForCapabilities(options.allow);
  return {
    host,
    bearerCredential: humanCredential,
    ...(harnessName === undefined ? {} : { harnessName }),
    ...(credentialScopes === undefined ? {} : { credentialScopes }),
    ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
    ...(options.environmentId === undefined ? {} : { environmentId: options.environmentId }),
    ...(options.ttlSeconds === undefined ? {} : { ttlSeconds: options.ttlSeconds }),
  };
}

export async function deriveAgentSessionFromHuman(
  api: ApiClient,
  host: string,
  humanCredential: string,
  options: ScopedAgentSessionOptions = {},
): Promise<DerivedAgentSession> {
  const result = await api.deriveAgentSession(
    buildDerivedSessionRequest(host, humanCredential, options),
  );
  if (!result.ok) {
    throw new CliError(result.envelope.error);
  }
  return { credential: result.credential, data: result.envelope.data };
}

export async function requireHumanSessionCredential(host: string): Promise<string> {
  const credential = await requireSessionCredential(host);
  return credential;
}

export function buildAgentMarkedChildEnv(input: {
  readonly credential: string;
  readonly host: string;
  readonly agentTag?: string;
  readonly agentCredentialFile?: string;
  readonly env?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const extraEnv: NodeJS.ProcessEnv = {
    [CLI_SESSION_TOKEN_ENV]: input.credential,
    INSECUR_HOST: input.host,
  };
  if (input.agentTag !== undefined) {
    extraEnv[CLI_AGENT_TAG_ENV] = input.agentTag;
  }
  if (input.agentCredentialFile !== undefined) {
    extraEnv[CLI_AGENT_CREDENTIAL_FILE_ENV] = input.agentCredentialFile;
  }
  return buildCliChildEnv({ env: input.env, extraEnv });
}

export function buildAgentEnvExports(input: {
  readonly host: string;
  readonly agentCredentialFile: string;
  readonly agentTag?: string;
}): Record<string, string> {
  const exports: Record<string, string> = {
    INSECUR_HOST: input.host,
    [CLI_AGENT_CREDENTIAL_FILE_ENV]: input.agentCredentialFile,
  };
  if (input.agentTag !== undefined) {
    exports[CLI_AGENT_TAG_ENV] = input.agentTag;
  }
  return exports;
}

export function buildRegisterRequest(flags: GlobalCliFlags): {
  readonly harnessName: string;
  readonly ancestryKey: string;
} {
  const harnessName = resolveHarnessName() ?? resolveAgentTag(flags);
  if (harnessName === undefined) {
    throw new CliError({
      code: "validation.invalid_command_input",
      message:
        "No known agent harness detected. Pass --agent <name> or set INSECUR_AGENT_TAG, or run from a recognized harness environment.",
      retryable: false,
    });
  }
  return { harnessName, ancestryKey: buildAncestryKey() };
}
