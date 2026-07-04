import { successEnvelope, type VariableKey } from "@insecur/domain";
import type {
  ApiClient,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { parseVariableKeyOrThrow } from "./parse-variable-key.js";
import { assertRunModeExclusive, splitRunCommandArgs } from "./resolve-run-profile.js";
import { buildRunChildEnv, decodeDeliveryValue, spawnCommand } from "./run-child.js";
import { runProfilePolicyPath } from "./run-profile-policy.js";
import { buildRunResolvedTargets } from "./run-result.js";
import {
  recordRunCompletedBestEffort,
  requireRunCommand,
  type RunCommandOptions,
} from "./run-shared.js";
import { requireSecretWriteScope, type ResolvedSecretWriteScope } from "./secrets-set-scope.js";

async function issueAndConsumeVariableKeyGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
}): Promise<{ issueData: IssueInjectionGrantData; delivery: InjectionGrantDeliveryData }> {
  const issueResult = await input.api.issueInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    projectId: input.runScope.projectId,
    environmentId: input.runScope.envId,
    variableKey: input.variableKey,
  });
  if (!issueResult.ok) {
    throw new CliError(issueResult.envelope.error);
  }

  const consumeResult = await input.api.consumeInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: issueResult.envelope.data.grantId,
    variableKey: input.variableKey,
  });
  if (!consumeResult.ok) {
    throw new CliError(consumeResult.envelope.error);
  }

  return {
    issueData: issueResult.envelope.data,
    delivery: consumeResult.envelope.delivery,
  };
}

async function runVariableKeyPath(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  const credential = requireSessionCredential();
  const runScope = requireSecretWriteScope(context.scope);
  const variableKey = parseVariableKeyOrThrow(commandOptions.variableKey ?? "");
  const command = requireRunCommand(commandOptions.command);
  const { issueData, delivery } = await issueAndConsumeVariableKeyGrant({
    api,
    credential,
    host: context.scope.host,
    runScope,
    variableKey,
  });

  const childExitCode = await spawnCommand(
    command,
    buildRunChildEnv(variableKey, decodeDeliveryValue(delivery.encodedValueUtf8)),
  );

  await recordRunCompletedBestEffort({
    api,
    host: context.scope.host,
    credential,
    organizationId: runScope.orgId,
    grantId: issueData.grantId,
    childExitCode,
  });

  renderSuccess(
    successEnvelope(
      {
        grantId: issueData.grantId,
        variableKey: delivery.variableKey,
        secretId: delivery.secretId,
        secretVersionId: delivery.secretVersionId,
        childExitCode,
        ...(delivery.auditEventId !== undefined ? { auditEventId: delivery.auditEventId } : {}),
      },
      buildEnvelopeMeta({
        resolvedTargets: buildRunResolvedTargets(runScope, variableKey, issueData, delivery),
      }),
    ),
    flags,
    (data) =>
      `Injected ${data.variableKey} via grant ${data.grantId}; child exited with code ${String(data.childExitCode)}.`,
  );
  return childExitCode;
}

export async function runRunCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  assertRunModeExclusive({
    flags,
    context,
    ...(commandOptions.variableKey === undefined
      ? {}
      : { variableKey: commandOptions.variableKey }),
    ...(commandOptions.profileSelector === undefined
      ? {}
      : { profileSelector: commandOptions.profileSelector }),
  });
  if (commandOptions.variableKey !== undefined && commandOptions.variableKey !== "") {
    return runVariableKeyPath(flags, api, context, commandOptions);
  }
  return runProfilePolicyPath(flags, api, context, commandOptions);
}

export { splitRunCommandArgs, type RunCommandOptions };
