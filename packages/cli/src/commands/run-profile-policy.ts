import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { assertHostedCapability } from "../local/cloud-feature-guard.js";
import { resolveProfileRunInput } from "./resolve-run-profile.js";
import { buildPolicyRunChildEnv, spawnCommand } from "./run-child.js";
import type { RunCommandOptions } from "./run-shared.js";
import { recordRunCompletedBestEffort, requireRunCommand } from "./run-shared.js";
import { issueAndConsumePolicyGrant } from "./run-injection-grants.js";
import { renderProfileRunSuccess } from "./run-result.js";
import { runProfilePolicyWatchPath } from "./run-watch-executions.js";

export async function runProfilePolicyPath(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  assertHostedCapability(context.scope, {
    capability: "Profile-backed runtime injection",
    hostedCommand: ["insecur", "run", "<profile>", "--", "<command>"],
  });
  const profileRun = resolveProfileRunInput({
    flags,
    context,
    ...(commandOptions.profileSelector === undefined
      ? {}
      : { profileSelector: commandOptions.profileSelector }),
    ...(commandOptions.policyIdOverride === undefined
      ? {}
      : { policyIdOverride: commandOptions.policyIdOverride }),
  });
  const credential = await requireSessionCredential(profileRun.host);
  const command = requireRunCommand(commandOptions.command);
  if (commandOptions.watch === true) {
    return runProfilePolicyWatchPath({ flags, api, context, credential, profileRun, command });
  }

  return runProfilePolicySingleShot({ flags, api, credential, profileRun, command });
}

async function runProfilePolicySingleShot(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly credential: string;
  readonly profileRun: ReturnType<typeof resolveProfileRunInput>;
  readonly command: readonly string[];
}): Promise<number> {
  const { issueData, delivery, requestId } = await issueAndConsumePolicyGrant({
    api: input.api,
    credential: input.credential,
    host: input.profileRun.host,
    runScope: input.profileRun.runScope,
    policyId: input.profileRun.policyId,
  });

  const childExitCode = await spawnCommand(input.command, buildPolicyRunChildEnv(delivery.entries));

  await recordRunCompletedBestEffort({
    api: input.api,
    host: input.profileRun.host,
    credential: input.credential,
    organizationId: input.profileRun.runScope.orgId,
    grantId: issueData.grantId,
    childExitCode,
  });

  renderProfileRunSuccess({
    flags: input.flags,
    profileRun: input.profileRun,
    issueData,
    delivery,
    childExitCode,
    requestId,
  });
  return childExitCode;
}
