import { successEnvelope, type VariableKey } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { collectSecretValue, type CollectedSecretValue } from "../input/collect-secret-value.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { parseVariableKeyOrThrow } from "./parse-variable-key.js";
import { buildSecretsSetResolvedTargets } from "./secrets-set-result.js";
import { requireSecretWriteScope } from "./secrets-set-scope.js";

type SecretWriteScope = ReturnType<typeof requireSecretWriteScope>;
type SecretWriteByVariableKeyInput = Parameters<ApiClient["writeSecretByVariableKey"]>[0];

export interface SecretsSetCommandOptions {
  readonly variableKey: string;
  readonly generateMode: string | true | undefined;
  readonly generateLength: string | undefined;
  readonly valueStdin: boolean;
  readonly allowEmpty: boolean;
}

function buildSecretWriteByVariableKeyInput(input: {
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly writeScope: SecretWriteScope;
  readonly variableKey: VariableKey;
  readonly collected: CollectedSecretValue;
  readonly allowEmpty: boolean;
}): SecretWriteByVariableKeyInput {
  const base = {
    host: input.context.scope.host,
    bearerCredential: input.credential,
    organizationId: input.writeScope.orgId,
    projectId: input.writeScope.projectId,
    environmentId: input.writeScope.envId,
    variableKey: input.variableKey,
  };
  if (input.collected.inputMode === "generated") {
    return { ...base, generate: input.collected.generate };
  }
  return {
    ...base,
    valueUtf8: input.collected.valueUtf8,
    ...(input.allowEmpty ? { allowEmpty: true } : {}),
  };
}

export async function runSecretsSetCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: SecretsSetCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const writeScope = requireSecretWriteScope(context.scope);
  const variableKey = parseVariableKeyOrThrow(commandOptions.variableKey);
  const collected = await collectSecretValue({
    generateMode: commandOptions.generateMode,
    generateLength: commandOptions.generateLength,
    valueStdin: commandOptions.valueStdin,
    allowEmpty: commandOptions.allowEmpty,
    inputRequiredUsage: ["insecur", "secrets", "set", variableKey, "--value-stdin"],
  });

  const result = await api.writeSecretByVariableKey(
    buildSecretWriteByVariableKeyInput({
      context,
      credential,
      writeScope,
      variableKey,
      collected,
      allowEmpty: commandOptions.allowEmpty,
    }),
  );

  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const data = result.envelope.data;
  const output = successEnvelope(
    {
      secretId: data.secretId,
      secretVersionId: data.secretVersionId,
      variableKey: data.variableKey,
      createdSecretShape: data.createdSecretShape,
      ...(data.auditEventId !== undefined ? { auditEventId: data.auditEventId } : {}),
    },
    buildEnvelopeMeta({
      requestId: result.envelope.meta?.requestId,
      resolvedTargets: buildSecretsSetResolvedTargets(writeScope, variableKey, data),
    }),
  );

  renderSuccess(
    output,
    flags,
    () => `Wrote secret ${variableKey} (${data.secretId}) in environment ${writeScope.envId}.`,
  );
  return 0;
}
