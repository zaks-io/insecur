import { buildAncestryKey, detectHarnessFromEnv } from "@insecur/agent-attribution";
import type { DeriveAgentSessionData } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { CLI_AGENT_CREDENTIAL_FILE_ENV, CLI_AGENT_TAG_ENV } from "../auth/agent-env-keys.js";
import { CLI_SESSION_TOKEN_ENV, buildCliChildEnv } from "../auth/child-env.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { CliError } from "../output/cli-error.js";

export interface DerivedAgentSession {
  readonly credential: string;
  readonly data: DeriveAgentSessionData;
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

export async function deriveAgentSessionFromHuman(
  api: ApiClient,
  host: string,
  humanCredential: string,
): Promise<DerivedAgentSession> {
  const harnessName = resolveHarnessName();
  const result = await api.deriveAgentSession({
    host,
    bearerCredential: humanCredential,
    ...(harnessName === undefined ? {} : { harnessName }),
  });
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
