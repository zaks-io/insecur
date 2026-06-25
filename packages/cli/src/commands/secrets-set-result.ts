import type { ResolvedTargetEcho } from "@insecur/domain";
import type { SecretWriteByVariableKeyData } from "../api/types.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";
import { asEchoId } from "../output/target-echo.js";

export function buildSecretsSetResolvedTargets(
  scope: ResolvedSecretWriteScope,
  variableKey: string,
  data: SecretWriteByVariableKeyData,
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
      type: "secret",
      id: asEchoId(data.secretId),
      slug: variableKey,
      parent: { type: "environment", id: asEchoId(scope.envId) },
    },
  ];
}
