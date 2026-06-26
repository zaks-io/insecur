import type { ResolvedTargetEcho } from "@insecur/domain";
import type { InjectionGrantDeliveryData, IssueInjectionGrantData } from "../api/types.js";
import { buildSecretWriteResolvedTargets } from "../output/secret-write-target-echo.js";
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
