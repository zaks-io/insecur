import type { OpaqueResourceId, ResolvedTargetEcho } from "@insecur/domain";
import type { ResolvedSecretWriteScope } from "../commands/secrets-set-scope.js";
import { asEchoId } from "./target-echo.js";

function buildScopeResolvedTargets(scope: ResolvedSecretWriteScope): ResolvedTargetEcho[] {
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
  ];
}

export function buildSecretWriteResolvedTargets(input: {
  readonly scope: ResolvedSecretWriteScope;
  readonly variableKey: string;
  readonly secretId: OpaqueResourceId | string;
  readonly injectionGrantId?: OpaqueResourceId | string;
}): ResolvedTargetEcho[] {
  const targets = buildScopeResolvedTargets(input.scope);

  if (input.injectionGrantId !== undefined) {
    targets.push({
      type: "injection_grant",
      id: asEchoId(input.injectionGrantId),
      parent: { type: "environment", id: asEchoId(input.scope.envId) },
    });
  }

  targets.push({
    type: "secret",
    id: asEchoId(input.secretId),
    slug: input.variableKey,
    parent: { type: "environment", id: asEchoId(input.scope.envId) },
  });

  return targets;
}
