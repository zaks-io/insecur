import type { VariableKey } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { resolveProjectRoot } from "../config/paths.js";
import type { ResolvedProfileRunInput } from "./resolve-run-profile.js";
import { buildPolicyRunChildEnv, buildRunChildEnv, decodeDeliveryValue } from "./run-child.js";
import {
  issueAndConsumePolicyGrant,
  issueAndConsumeVariableKeyGrant,
} from "./run-injection-grants.js";
import { renderProfileRunSuccess, renderVariableKeyRunSuccess } from "./run-result.js";
import { recordRunCompletedBestEffort } from "./run-shared.js";
import { assertRunWatchDevelopmentEnvironment } from "./run-watch-guard.js";
import { runWatchLoop } from "./run-watch.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

async function completeVariableKeyWatchIteration(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
  readonly childExitCode: number;
  readonly issueData: Awaited<ReturnType<typeof issueAndConsumeVariableKeyGrant>>["issueData"];
  readonly delivery: Awaited<ReturnType<typeof issueAndConsumeVariableKeyGrant>>["delivery"];
}): Promise<void> {
  await recordRunCompletedBestEffort({
    api: input.api,
    host: input.context.scope.host,
    credential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: input.issueData.grantId,
    childExitCode: input.childExitCode,
  });
  renderVariableKeyRunSuccess({
    flags: input.flags,
    runScope: input.runScope,
    variableKey: input.variableKey,
    issueData: input.issueData,
    delivery: input.delivery,
    childExitCode: input.childExitCode,
  });
}

async function completeProfileWatchIteration(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly credential: string;
  readonly profileRun: ResolvedProfileRunInput;
  readonly childExitCode: number;
  readonly issueData: Awaited<ReturnType<typeof issueAndConsumePolicyGrant>>["issueData"];
  readonly delivery: Awaited<ReturnType<typeof issueAndConsumePolicyGrant>>["delivery"];
}): Promise<void> {
  await recordRunCompletedBestEffort({
    api: input.api,
    host: input.profileRun.host,
    credential: input.credential,
    organizationId: input.profileRun.runScope.orgId,
    grantId: input.issueData.grantId,
    childExitCode: input.childExitCode,
  });
  renderProfileRunSuccess({
    flags: input.flags,
    profileRun: input.profileRun,
    issueData: input.issueData,
    delivery: input.delivery,
    childExitCode: input.childExitCode,
  });
}

export async function runVariableKeyWatchPath(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
  readonly command: readonly string[];
}): Promise<number> {
  assertRunWatchDevelopmentEnvironment({
    envId: input.runScope.envId,
    projectConfig: input.context.projectConfig,
  });
  return runWatchLoop({
    command: input.command,
    watchRoot: resolveProjectRoot(input.flags.configDir),
    executeIteration: async () => {
      const grant = await issueAndConsumeVariableKeyGrant({
        api: input.api,
        credential: input.credential,
        host: input.context.scope.host,
        runScope: input.runScope,
        variableKey: input.variableKey,
      });
      let decodedValue: string | undefined = decodeDeliveryValue(grant.delivery.encodedValueUtf8);
      return {
        grantId: grant.issueData.grantId,
        childEnv: buildRunChildEnv(input.variableKey, decodedValue),
        releaseSensitiveValues: () => {
          decodedValue = undefined;
        },
        onChildCompleted: async (childExitCode) => {
          await completeVariableKeyWatchIteration({
            ...input,
            childExitCode,
            issueData: grant.issueData,
            delivery: grant.delivery,
          });
        },
      };
    },
  });
}

export async function runProfilePolicyWatchPath(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly credential: string;
  readonly profileRun: ResolvedProfileRunInput;
  readonly command: readonly string[];
}): Promise<number> {
  assertRunWatchDevelopmentEnvironment({
    envId: input.profileRun.runScope.envId,
    projectConfig: input.context.projectConfig,
  });
  return runWatchLoop({
    command: input.command,
    watchRoot: resolveProjectRoot(input.flags.configDir),
    executeIteration: async () => {
      const grant = await issueAndConsumePolicyGrant({
        api: input.api,
        credential: input.credential,
        host: input.profileRun.host,
        runScope: input.profileRun.runScope,
        policyId: input.profileRun.policyId,
      });
      let decodedEntries = grant.delivery.entries.map((entry) => ({
        variableKey: entry.variableKey,
        encodedValueUtf8: entry.encodedValueUtf8,
      }));
      return {
        grantId: grant.issueData.grantId,
        childEnv: buildPolicyRunChildEnv(decodedEntries),
        releaseSensitiveValues: () => {
          decodedEntries = [];
        },
        onChildCompleted: async (childExitCode) => {
          await completeProfileWatchIteration({
            flags: input.flags,
            api: input.api,
            credential: input.credential,
            profileRun: input.profileRun,
            childExitCode,
            issueData: grant.issueData,
            delivery: grant.delivery,
          });
        },
      };
    },
  });
}
