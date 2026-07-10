import { CLI_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { ApiClient } from "../api/types.js";
import {
  formatAgentEnvExports,
  writeAgentCredentialFile,
  type AgentCredentialStore,
} from "../auth/agent-credential-store.js";
import { CLI_SESSION_TOKEN_ENV } from "../auth/child-env.js";
import {
  buildAgentEnvExports,
  bindAgentSessionPolicyToContext,
  deriveAgentSessionFromHuman,
  requireHumanSessionCredential,
  resolveAgentTag,
} from "./agent-shared.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";
import type { AgentSessionPolicyOptions } from "./agent-session-policy.js";
import type { DerivedAgentSession } from "./agent-shared.js";

const ALLOWED_AGENT_ENV_EXPORT_KEYS = new Set([
  "INSECUR_HOST",
  "INSECUR_AGENT_CREDENTIAL_FILE",
  "INSECUR_AGENT_TAG",
]);

function assertMetadataOnlyAgentEnvOutput(exports: Record<string, string>): void {
  for (const key of Object.keys(exports)) {
    if (!ALLOWED_AGENT_ENV_EXPORT_KEYS.has(key)) {
      throw new Error(`agent env exported unexpected key ${key}`);
    }
  }
  if (CLI_SESSION_TOKEN_ENV in exports) {
    throw new Error("agent env must not export session token material");
  }
  const serialized = JSON.stringify(exports);
  for (const forbidden of ['"credential"', '"token"', '"password"', '"secret"', '"plaintext"']) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `agent env output must remain metadata-only; found forbidden field ${forbidden}`,
      );
    }
  }
}

async function formatPersistedAgentEnv(input: {
  readonly derived: DerivedAgentSession;
  readonly host: string;
  readonly agentTag: string | undefined;
  readonly store: AgentCredentialStore | undefined;
}): Promise<string> {
  const credentialFile = await writeAgentCredentialFile(
    {
      credential: input.derived.credential,
      sessionId: input.derived.data.sessionId,
      expiresAt: input.derived.data.expiresAt,
      host: input.host,
    },
    input.store,
  );
  const exports = buildAgentEnvExports({
    host: input.host,
    agentCredentialFile: credentialFile,
    ...(input.agentTag === undefined ? {} : { agentTag: input.agentTag }),
  });
  assertMetadataOnlyAgentEnvOutput(exports);
  return `${formatAgentEnvExports(exports)}\n`;
}

export async function runAgentEnvCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: AgentSessionPolicyOptions & {
    readonly agentCredentialStore?: AgentCredentialStore;
  } = {},
): Promise<number> {
  if (flags.json) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.validationError,
        message: "insecur agent env cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const humanCredential = await requireHumanSessionCredential(context.scope.host);
  const policy = bindAgentSessionPolicyToContext(options, context);
  const derived = await deriveAgentSessionFromHuman(
    api,
    context.scope.host,
    humanCredential,
    policy,
  );
  const agentTag = resolveAgentTag(flags);
  const output = await formatPersistedAgentEnv({
    derived,
    host: context.scope.host,
    agentTag,
    store: options.agentCredentialStore,
  });
  process.stdout.write(output);
  return 0;
}
