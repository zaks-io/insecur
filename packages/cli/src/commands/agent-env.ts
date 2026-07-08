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
  deriveAgentSessionFromHuman,
  requireHumanSessionCredential,
  resolveAgentTag,
} from "./agent-shared.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";

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

export async function runAgentEnvCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: { readonly agentCredentialStore?: AgentCredentialStore } = {},
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
  const derived = await deriveAgentSessionFromHuman(api, context.scope.host, humanCredential);
  const agentTag = resolveAgentTag(flags);
  const store = options.agentCredentialStore;
  const credentialFile = await writeAgentCredentialFile(
    {
      credential: derived.credential,
      sessionId: derived.data.sessionId,
      expiresAt: derived.data.expiresAt,
      host: context.scope.host,
    },
    store,
  );
  const exports = buildAgentEnvExports({
    host: context.scope.host,
    agentCredentialFile: credentialFile,
    ...(agentTag === undefined ? {} : { agentTag }),
  });
  const output = `${formatAgentEnvExports(exports)}\n`;
  assertMetadataOnlyAgentEnvOutput(exports);
  process.stdout.write(output);
  return 0;
}
