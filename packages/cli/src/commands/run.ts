import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { parseVariableKeyOrThrow } from "./parse-variable-key.js";
import { assertRunModeExclusive } from "./resolve-run-profile.js";
import { buildRunChildEnv, decodeDeliveryValue, spawnCommand } from "./run-child.js";
import { runProfilePolicyPath } from "./run-profile-policy.js";
import { issueAndConsumeVariableKeyGrant } from "./run-injection-grants.js";
import { renderVariableKeyRunSuccess } from "./run-result.js";
import { runVariableKeyWatchPath } from "./run-watch-executions.js";
import {
  recordRunCompletedBestEffort,
  requireRunCommand,
  type RunCommandOptions,
} from "./run-shared.js";
import { requireSecretWriteScope } from "./secrets-set-scope.js";

async function runVariableKeyPath(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const runScope = requireSecretWriteScope(context.scope);
  const variableKey = parseVariableKeyOrThrow(commandOptions.variableKey ?? "");
  const command = requireRunCommand(commandOptions.command);
  if (commandOptions.watch === true) {
    return runVariableKeyWatchPath({
      flags,
      api,
      context,
      credential,
      runScope,
      variableKey,
      command,
    });
  }

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

  renderVariableKeyRunSuccess({
    flags,
    runScope,
    variableKey,
    issueData,
    delivery,
    childExitCode,
  });
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

export type { RunCommandOptions };
