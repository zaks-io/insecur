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
import { runRunPlanCommand } from "./run-plan.js";

async function executeVariableKeyRun(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly host: string;
  readonly credential: string;
  readonly runScope: ReturnType<typeof requireSecretWriteScope>;
  readonly variableKey: ReturnType<typeof parseVariableKeyOrThrow>;
  readonly command: readonly string[];
}): Promise<number> {
  const grant = await issueAndConsumeVariableKeyGrant({
    api: input.api,
    credential: input.credential,
    host: input.host,
    runScope: input.runScope,
    variableKey: input.variableKey,
  });
  const childExitCode = await spawnCommand(
    input.command,
    buildRunChildEnv(input.variableKey, decodeDeliveryValue(grant.delivery.encodedValueUtf8)),
    input.flags.json ? { controlOutput: "stdout-json" } : {},
  );
  await recordRunCompletedBestEffort({
    api: input.api,
    host: input.host,
    credential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: grant.issueData.grantId,
    childExitCode,
  });
  renderVariableKeyRunSuccess({
    flags: input.flags,
    runScope: input.runScope,
    variableKey: input.variableKey,
    issueData: grant.issueData,
    delivery: grant.delivery,
    childExitCode,
    requestId: grant.requestId,
  });
  return childExitCode;
}

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

  return executeVariableKeyRun({
    flags,
    api,
    host: context.scope.host,
    credential,
    runScope,
    variableKey,
    command,
  });
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
  if (commandOptions.plan === true) {
    return runRunPlanCommand(flags, api, context, commandOptions);
  }
  if (commandOptions.variableKey !== undefined && commandOptions.variableKey !== "") {
    return runVariableKeyPath(flags, api, context, commandOptions);
  }
  return runProfilePolicyPath(flags, api, context, commandOptions);
}

export type { RunCommandOptions };
