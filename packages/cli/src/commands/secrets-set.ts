import { successEnvelope, type NextAction, type VariableKey } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { collectSecretValue, type CollectedSecretValue } from "../input/collect-secret-value.js";
import { CliError, cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { parseVariableKeyOrThrow } from "./parse-variable-key.js";
import { buildSecretsSetResolvedTargets } from "./secrets-set-result.js";
import { requireSecretWriteScope } from "./secrets-set-scope.js";
import { parseGeneratedSecretRequest } from "../input/generate-random-secret.js";

type SecretWriteScope = ReturnType<typeof requireSecretWriteScope>;
type SecretWriteByVariableKeyInput = Parameters<ApiClient["writeSecretByVariableKey"]>[0];

export interface SecretsSetCommandOptions {
  readonly variableKey: string;
  readonly generateMode: string | true | undefined;
  readonly generateLength: string | undefined;
  readonly valueStdin: boolean;
  readonly allowEmpty: boolean;
  readonly dryRun?: boolean;
}

type SecretWriteMode = "generated" | "stdin" | "input_required";

function validatePlanOptions(options: SecretsSetCommandOptions): void {
  if (options.generateMode !== undefined && options.valueStdin) {
    throw new CliError({
      code: "secret.invalid_input_mode",
      message: "Use either --generate or --value-stdin, not both.",
      retryable: false,
    });
  }
  if (options.generateMode !== undefined) {
    parseGeneratedSecretRequest(options);
  }
}

function secretWriteMode(options: SecretsSetCommandOptions): SecretWriteMode {
  if (options.generateMode !== undefined) {
    return "generated";
  }
  return options.valueStdin ? "stdin" : "input_required";
}

function secretPlanArgv(
  variableKey: VariableKey,
  options: SecretsSetCommandOptions,
  writeMode: SecretWriteMode,
): readonly string[] {
  return [
    "insecur",
    "secrets",
    "set",
    variableKey,
    ...(writeMode === "generated"
      ? ["--generate", "random", "--length", options.generateLength ?? "32"]
      : ["--value-stdin"]),
    "--json",
  ];
}

function renderSecretPlan(input: {
  readonly flags: GlobalCliFlags;
  readonly writeScope: SecretWriteScope;
  readonly variableKey: VariableKey;
  readonly options: SecretsSetCommandOptions;
  readonly exists: boolean;
}): number {
  const writeMode = secretWriteMode(input.options);
  const next: readonly NextAction[] = [
    {
      id: "write-secret",
      actor: writeMode === "generated" ? "agent" : "human",
      kind: "execute",
      argv: secretPlanArgv(input.variableKey, input.options, writeMode),
    },
  ];
  const effect = input.exists ? ("update" as const) : ("create" as const);
  const data = {
    plan: {
      variableKey: input.variableKey,
      environmentId: input.writeScope.envId,
      effect,
      writeMode,
      ready: writeMode !== "input_required",
      sensitiveValueCollected: false,
      writesSent: 0,
    },
  };
  renderSuccess(
    successEnvelope(data, undefined, next),
    input.flags,
    () => `Secret write plan: ${effect} ${input.variableKey}; no write sent.`,
  );
  return 0;
}

async function renderSecretsSetPlan(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly writeScope: SecretWriteScope;
  readonly variableKey: VariableKey;
  readonly commandOptions: SecretsSetCommandOptions;
}): Promise<number> {
  validatePlanOptions(input.commandOptions);
  const listed = await input.api.listEnvironmentSecrets({
    host: input.context.scope.host,
    bearerCredential: input.credential,
    organizationId: input.writeScope.orgId,
    projectId: input.writeScope.projectId,
    environmentId: input.writeScope.envId,
  });
  if (!listed.ok) {
    throw cliErrorFromEnvelope(listed.envelope);
  }
  const exists = listed.envelope.data.secrets.some(
    (secret) => secret.variableKey === input.variableKey,
  );
  return renderSecretPlan({
    flags: input.flags,
    writeScope: input.writeScope,
    variableKey: input.variableKey,
    options: input.commandOptions,
    exists,
  });
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

type SuccessfulSecretWrite = Extract<
  Awaited<ReturnType<ApiClient["writeSecretByVariableKey"]>>,
  { readonly ok: true }
>;

function renderCompletedSecretWrite(input: {
  readonly flags: GlobalCliFlags;
  readonly writeScope: SecretWriteScope;
  readonly variableKey: VariableKey;
  readonly result: SuccessfulSecretWrite;
}): number {
  const data = input.result.envelope.data;
  const output = successEnvelope(
    {
      secretId: data.secretId,
      secretVersionId: data.secretVersionId,
      variableKey: data.variableKey,
      createdSecretShape: data.createdSecretShape,
      ...(data.auditEventId !== undefined ? { auditEventId: data.auditEventId } : {}),
    },
    buildEnvelopeMeta({
      requestId: input.result.envelope.meta?.requestId,
      resolvedTargets: buildSecretsSetResolvedTargets(input.writeScope, input.variableKey, data),
    }),
  );
  renderSuccess(
    output,
    input.flags,
    () =>
      `Wrote secret ${input.variableKey} (${data.secretId}) in environment ${input.writeScope.envId}.`,
  );
  return 0;
}

async function executeSecretWrite(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly writeScope: SecretWriteScope;
  readonly variableKey: VariableKey;
  readonly options: SecretsSetCommandOptions;
}): Promise<number> {
  const collected = await collectSecretValue({
    generateMode: input.options.generateMode,
    generateLength: input.options.generateLength,
    valueStdin: input.options.valueStdin,
    allowEmpty: input.options.allowEmpty,
    inputRequiredUsage: ["insecur", "secrets", "set", input.variableKey, "--value-stdin"],
  });
  const result = await input.api.writeSecretByVariableKey(
    buildSecretWriteByVariableKeyInput({
      context: input.context,
      credential: input.credential,
      writeScope: input.writeScope,
      variableKey: input.variableKey,
      collected,
      allowEmpty: input.options.allowEmpty,
    }),
  );
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }
  return renderCompletedSecretWrite({ ...input, result });
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
  if (commandOptions.dryRun === true) {
    return renderSecretsSetPlan({
      flags,
      api,
      context,
      credential,
      writeScope,
      variableKey,
      commandOptions,
    });
  }
  return executeSecretWrite({
    flags,
    api,
    context,
    credential,
    writeScope,
    variableKey,
    options: commandOptions,
  });
}
