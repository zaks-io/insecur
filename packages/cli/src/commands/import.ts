import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { successEnvelope, type ErrorBody } from "@insecur/domain";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import {
  assertImportTargetEnvironment,
  formatImportPlanHuman,
  runImportPreflight,
  secretImportPlanForOutput,
  throwImportPreflightFailure,
  type SecretImportPlan,
} from "./import-preflight.js";
import { requireSecretWriteScope } from "./secrets-set-scope.js";

export interface ImportCommandOptions {
  readonly filePath: string;
  readonly dryRun: boolean;
  readonly variableKeyPrefix?: string;
}

interface ImportWriteResult {
  variableKey: string;
  secretId: string;
  secretVersionId: string;
  createdSecretShape: boolean;
}

function throwImportWriteFailure(input: {
  readonly error: ErrorBody;
  readonly writeResults: readonly ImportWriteResult[];
  readonly attemptedWriteCount: number;
}): never {
  const writtenVariableKeys = input.writeResults.map((entry) => entry.variableKey);
  const partialMessage =
    writtenVariableKeys.length === 0
      ? ""
      : ` Import preflight had passed, but ${String(writtenVariableKeys.length)} secret(s) were written before this failure: ${writtenVariableKeys.join(", ")}. Re-run import will fail on those keys with import.existing_secret.`;
  throw new CliError(
    {
      ...input.error,
      message: `${input.error.message}${partialMessage}`,
    },
    undefined,
    writtenVariableKeys.length === 0
      ? undefined
      : {
          writtenVariableKeys,
          completedWriteCount: writtenVariableKeys.length,
          attemptedWriteCount: input.attemptedWriteCount,
        },
  );
}

async function executeImportWrites(input: {
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly plan: SecretImportPlan;
}): Promise<readonly ImportWriteResult[]> {
  const writeScope = requireSecretWriteScope(input.context.scope);
  const writeResults: ImportWriteResult[] = [];

  for (const write of input.plan.writes) {
    const result = await input.api.writeSecretByVariableKey({
      host: input.context.scope.host,
      bearerCredential: input.credential,
      organizationId: writeScope.orgId,
      projectId: writeScope.projectId,
      environmentId: writeScope.envId,
      variableKey: write.variableKey,
      valueUtf8: write.valueUtf8,
      createOnly: true,
    });
    if (!result.ok) {
      throwImportWriteFailure({
        error: result.envelope.error,
        writeResults,
        attemptedWriteCount: input.plan.writes.length,
      });
    }
    writeResults.push({
      variableKey: result.envelope.data.variableKey,
      secretId: result.envelope.data.secretId,
      secretVersionId: result.envelope.data.secretVersionId,
      createdSecretShape: result.envelope.data.createdSecretShape,
    });
  }

  return writeResults;
}

function renderImportPlan(flags: GlobalCliFlags, plan: SecretImportPlan, dryRun: boolean): void {
  const output = successEnvelope(
    { plan: secretImportPlanForOutput(plan, { dryRun }) },
    buildEnvelopeMeta({}),
  );
  renderSuccess(output, flags, () => formatImportPlanHuman(plan, { dryRun }));
}

async function loadImportPlan(input: {
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly filePath: string;
  readonly variableKeyPrefix?: string;
}): Promise<{ readonly filePath: string; readonly plan: SecretImportPlan }> {
  const writeScope = requireSecretWriteScope(input.context.scope);
  const filePath = resolve(input.filePath);
  const fileBytes = new Uint8Array(await readFile(filePath));
  const plan = await runImportPreflight({
    api: input.api,
    host: input.context.scope.host,
    bearerCredential: input.credential,
    organizationId: writeScope.orgId,
    projectId: writeScope.projectId,
    environmentId: writeScope.envId,
    fileBytes,
    ...(input.variableKeyPrefix === undefined
      ? {}
      : { variableKeyPrefix: input.variableKeyPrefix }),
  });
  return { filePath, plan };
}

function renderImportSuccess(input: {
  readonly flags: GlobalCliFlags;
  readonly writeScope: ReturnType<typeof requireSecretWriteScope>;
  readonly commandOptions: ImportCommandOptions;
  readonly filePath: string;
  readonly writeResults: Awaited<ReturnType<typeof executeImportWrites>>;
}): void {
  const output = successEnvelope(
    {
      importedCount: input.writeResults.length,
      secrets: input.writeResults,
      sourceFilePath: input.filePath,
    },
    buildEnvelopeMeta({}),
  );
  renderSuccess(
    output,
    input.flags,
    () =>
      `Imported ${String(input.writeResults.length)} secret(s) into environment ${input.writeScope.envId}. Source file ${input.filePath} was not modified. To remove it locally, run: insecur local-files rm ${input.commandOptions.filePath}`,
  );
}

function completeImportCommand(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly writeScope: ReturnType<typeof requireSecretWriteScope>;
  readonly commandOptions: ImportCommandOptions;
  readonly filePath: string;
  readonly plan: SecretImportPlan;
}): Promise<number> {
  if (!input.plan.ready) {
    renderImportPlan(input.flags, input.plan, input.commandOptions.dryRun);
    throwImportPreflightFailure(input.plan);
  }

  if (input.commandOptions.dryRun) {
    renderImportPlan(input.flags, input.plan, true);
    return Promise.resolve(0);
  }

  return executeImportWrites({
    api: input.api,
    context: input.context,
    credential: input.credential,
    plan: input.plan,
  }).then((writeResults) => {
    renderImportSuccess({
      flags: input.flags,
      writeScope: input.writeScope,
      commandOptions: input.commandOptions,
      filePath: input.filePath,
      writeResults,
    });
    return 0;
  });
}

export async function runImportCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: ImportCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const writeScope = requireSecretWriteScope(context.scope);

  await assertImportTargetEnvironment({
    api,
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: writeScope.orgId,
    projectId: writeScope.projectId,
    environmentId: writeScope.envId,
  });

  const { filePath, plan } = await loadImportPlan({
    api,
    context,
    credential,
    filePath: commandOptions.filePath,
    ...(commandOptions.variableKeyPrefix === undefined
      ? {}
      : { variableKeyPrefix: commandOptions.variableKeyPrefix }),
  });

  return completeImportCommand({
    flags,
    api,
    context,
    credential,
    writeScope,
    commandOptions,
    filePath,
    plan,
  });
}
