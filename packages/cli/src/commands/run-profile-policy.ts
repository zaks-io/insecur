import { successEnvelope, type RuntimePolicyId } from "@insecur/domain";
import type {
  ApiClient,
  InjectionGrantDeliveryAllData,
  IssueInjectionGrantData,
} from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { resolveProfileRunInput, type ResolvedProfileRunInput } from "./resolve-run-profile.js";
import { buildPolicyRunChildEnv, spawnCommand } from "./run-child.js";
import { buildProfileRunResolvedTargets } from "./run-result.js";
import type { RunCommandOptions } from "./run-shared.js";
import { recordRunCompletedBestEffort, requireRunCommand } from "./run-shared.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

async function issueAndConsumePolicyGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly policyId: RuntimePolicyId;
}): Promise<{ issueData: IssueInjectionGrantData; delivery: InjectionGrantDeliveryAllData }> {
  const issueResult = await input.api.issueInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    projectId: input.runScope.projectId,
    environmentId: input.runScope.envId,
    policyId: input.policyId,
  });
  if (!issueResult.ok) {
    throw new CliError(issueResult.envelope.error);
  }

  const consumeResult = await input.api.consumeInjectionGrantAll({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: issueResult.envelope.data.grantId,
  });
  if (!consumeResult.ok) {
    throw new CliError(consumeResult.envelope.error);
  }

  return {
    issueData: issueResult.envelope.data,
    delivery: consumeResult.envelope.delivery,
  };
}

function renderProfileRunSuccess(input: {
  readonly flags: GlobalCliFlags;
  readonly profileRun: ResolvedProfileRunInput;
  readonly issueData: IssueInjectionGrantData;
  readonly delivery: InjectionGrantDeliveryAllData;
  readonly childExitCode: number;
}): void {
  const injectedVariableKeys = input.delivery.entries.map((entry) => entry.variableKey);
  renderSuccess(
    successEnvelope(
      {
        grantId: input.issueData.grantId,
        profileId: input.profileRun.profileId,
        profileSlug: input.profileRun.profileSlug,
        policyId: input.profileRun.policyId,
        injectedVariableKeys,
        bindings: input.delivery.entries.map((entry) => ({
          variableKey: entry.variableKey,
          secretId: entry.secretId,
          secretVersionId: entry.secretVersionId,
        })),
        childExitCode: input.childExitCode,
        ...(input.delivery.auditEventId !== undefined
          ? { auditEventId: input.delivery.auditEventId }
          : {}),
      },
      buildEnvelopeMeta({
        resolvedTargets: buildProfileRunResolvedTargets({
          scope: input.profileRun.runScope,
          profileId: input.profileRun.profileId,
          profile: input.profileRun.profile,
          policyId: input.profileRun.policyId,
          issueData: input.issueData,
          delivery: input.delivery,
        }),
      }),
    ),
    input.flags,
    (data) =>
      `Injected ${data.injectedVariableKeys.join(", ")} via profile ${data.profileSlug} and policy ${data.policyId}; child exited with code ${String(data.childExitCode)}.`,
  );
}

export async function runProfilePolicyPath(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  const credential = requireSessionCredential();
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
  const command = requireRunCommand(commandOptions.command);
  const { issueData, delivery } = await issueAndConsumePolicyGrant({
    api,
    credential,
    host: profileRun.host,
    runScope: profileRun.runScope,
    policyId: profileRun.policyId,
  });

  const childExitCode = await spawnCommand(command, buildPolicyRunChildEnv(delivery.entries));

  await recordRunCompletedBestEffort({
    api,
    host: profileRun.host,
    credential,
    organizationId: profileRun.runScope.orgId,
    grantId: issueData.grantId,
    childExitCode,
  });

  renderProfileRunSuccess({
    flags,
    profileRun,
    issueData,
    delivery,
    childExitCode,
  });
  return childExitCode;
}
