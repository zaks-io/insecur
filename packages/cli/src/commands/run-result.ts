import type { ResolvedTargetEcho } from "@insecur/domain";
import type { InjectionGrantDeliveryData, IssueInjectionGrantData } from "../api/types.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";
import { asEchoId } from "../output/target-echo.js";

export function buildRunResolvedTargets(
  scope: ResolvedSecretWriteScope,
  variableKey: string,
  issueData: IssueInjectionGrantData,
  deliveryData: InjectionGrantDeliveryData,
): ResolvedTargetEcho[] {
  return [
    {
      type: "organization",
      id: asEchoId(scope.orgId),
    },
    {
      type: "project",
      id: asEchoId(scope.projectId),
      parent: { type: "organization", id: asEchoId(scope.orgId) },
    },
    {
      type: "environment",
      id: asEchoId(scope.envId),
      parent: { type: "project", id: asEchoId(scope.projectId) },
    },
    {
      type: "injection_grant",
      id: asEchoId(issueData.grantId),
      parent: { type: "environment", id: asEchoId(scope.envId) },
    },
    {
      type: "secret",
      id: asEchoId(deliveryData.secretId),
      slug: variableKey,
      parent: { type: "environment", id: asEchoId(scope.envId) },
    },
  ];
}
