import type { ResolvedTargetEcho } from "@insecur/domain";
import type { SecretWriteByVariableKeyData } from "../api/types.js";
import { buildSecretWriteResolvedTargets } from "../output/secret-write-target-echo.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export function buildSecretsSetResolvedTargets(
  scope: ResolvedSecretWriteScope,
  variableKey: string,
  data: SecretWriteByVariableKeyData,
): ResolvedTargetEcho[] {
  return buildSecretWriteResolvedTargets({
    scope,
    variableKey,
    secretId: data.secretId,
  });
}
