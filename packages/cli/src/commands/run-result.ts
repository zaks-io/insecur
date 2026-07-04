import type { CliProfileId, ResolvedTargetEcho, RuntimePolicyId } from "@insecur/domain";
import type {
  InjectionGrantDeliveryAllData,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "../api/types.js";
import { buildCliProfileResolvedTarget } from "../display-name-resolution/profile-echo.js";
import type { CliUserProfile } from "../config/user-config.js";
import { buildSecretWriteResolvedTargets } from "../output/secret-write-target-echo.js";
import { asEchoId } from "../output/target-echo.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export function buildRunResolvedTargets(
  scope: ResolvedSecretWriteScope,
  variableKey: string,
  issueData: IssueInjectionGrantData,
  deliveryData: InjectionGrantDeliveryData,
): ResolvedTargetEcho[] {
  return buildSecretWriteResolvedTargets({
    scope,
    variableKey,
    secretId: deliveryData.secretId,
    injectionGrantId: issueData.grantId,
  });
}

export function buildProfileRunResolvedTargets(input: {
  readonly scope: ResolvedSecretWriteScope;
  readonly profileId: CliProfileId;
  readonly profile: CliUserProfile;
  readonly policyId: RuntimePolicyId;
  readonly issueData: IssueInjectionGrantData;
  readonly delivery: InjectionGrantDeliveryAllData;
}): ResolvedTargetEcho[] {
  const echoes: ResolvedTargetEcho[] = [
    buildCliProfileResolvedTarget(input.profileId, input.profile),
    {
      type: "runtime_policy",
      id: asEchoId(input.policyId),
      parent: { type: "environment", id: asEchoId(input.scope.envId) },
    },
    {
      type: "injection_grant",
      id: asEchoId(input.issueData.grantId),
      parent: { type: "environment", id: asEchoId(input.scope.envId) },
    },
  ];
  for (const entry of input.delivery.entries) {
    echoes.push(
      ...buildSecretWriteResolvedTargets({
        scope: input.scope,
        variableKey: entry.variableKey,
        secretId: entry.secretId,
        injectionGrantId: input.issueData.grantId,
      }),
    );
  }
  return echoes;
}
