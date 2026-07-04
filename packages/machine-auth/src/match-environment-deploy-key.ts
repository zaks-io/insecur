import type { EnvironmentId, ProjectId } from "@insecur/domain";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { verifyDeployKeySecret } from "./deploy-key-secret.js";
import { collectDeployKeyOverbroadCredentialScopes } from "./deploy-key-credential-scopes.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "./environment-deploy-key-auth-method-row.js";

export type EnvironmentDeployKeyMatchFailureReason =
  | "invalid"
  | "disabled"
  | "expired"
  | "wrong_environment"
  | "overbroad_scope";

export type EnvironmentDeployKeyMatchResult =
  | { ok: true; authMethod: EnvironmentDeployKeyAuthMethodRow }
  | {
      ok: false;
      reason: EnvironmentDeployKeyMatchFailureReason;
      reasonCode: (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
      authMethod?: EnvironmentDeployKeyAuthMethodRow;
    };

function failure(
  reason: EnvironmentDeployKeyMatchFailureReason,
  authMethod?: EnvironmentDeployKeyAuthMethodRow,
): Extract<EnvironmentDeployKeyMatchResult, { ok: false }> {
  const reasonCodeMap = {
    invalid: AUTH_ERROR_CODES.deployKeyInvalid,
    disabled: AUTH_ERROR_CODES.deployKeyDisabled,
    expired: AUTH_ERROR_CODES.expired,
    wrong_environment: AUTH_ERROR_CODES.deployKeyWrongEnvironment,
    overbroad_scope: AUTH_ERROR_CODES.deployKeyOverbroadScope,
  } as const;

  return {
    ok: false,
    reason,
    reasonCode: reasonCodeMap[reason],
    ...(authMethod !== undefined ? { authMethod } : {}),
  };
}

function isExpired(authMethod: EnvironmentDeployKeyAuthMethodRow, nowEpoch: number): boolean {
  if (authMethod.nonExpiring || authMethod.expiresAt === null) {
    return false;
  }
  return Math.floor(authMethod.expiresAt.getTime() / 1000) <= nowEpoch;
}

function validateMatchedAuthMethod(
  authMethod: EnvironmentDeployKeyAuthMethodRow,
  input: {
    projectId: ProjectId;
    environmentId: EnvironmentId;
    nowEpoch: number;
  },
): EnvironmentDeployKeyMatchResult | null {
  if (collectDeployKeyOverbroadCredentialScopes(authMethod.credentialScopes).length > 0) {
    return failure("overbroad_scope", authMethod);
  }
  if (authMethod.status === "disabled") {
    return failure("disabled", authMethod);
  }
  if (isExpired(authMethod, input.nowEpoch)) {
    return failure("expired", authMethod);
  }
  if (
    authMethod.projectId !== input.projectId ||
    authMethod.environmentId !== input.environmentId
  ) {
    return null;
  }
  return { ok: true, authMethod };
}

export function matchEnvironmentDeployKey(input: {
  deployKeySecret: string;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  authMethods: readonly EnvironmentDeployKeyAuthMethodRow[];
  nowEpoch: number;
}): EnvironmentDeployKeyMatchResult {
  let sawWrongEnvironment = false;

  for (const authMethod of input.authMethods) {
    if (!verifyDeployKeySecret(input.deployKeySecret, authMethod.secretVerifier)) {
      continue;
    }

    const validated = validateMatchedAuthMethod(authMethod, input);
    if (validated === null) {
      sawWrongEnvironment = true;
      continue;
    }
    return validated;
  }

  return failure(sawWrongEnvironment ? "wrong_environment" : "invalid");
}
