import type {
  AuthErrorCode,
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RequestId,
  RuntimePolicyId,
} from "@insecur/domain";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { loadActiveEnvironmentDeployKeyAuthMethods } from "./load-environment-deploy-key-auth-methods.js";
import {
  matchEnvironmentDeployKey,
  type EnvironmentDeployKeyMatchFailureReason,
  type EnvironmentDeployKeyMatchResult,
} from "./match-environment-deploy-key.js";
import { mintMachineAccessToken } from "./machine-access-token.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "./environment-deploy-key-auth-method-row.js";
import {
  mapDeployKeyDenialToReasonCode,
  recordEnvironmentDeployKeyExchangeDenied,
  recordEnvironmentDeployKeyExchangeSuccess,
} from "./record-environment-deploy-key-exchange-audit.js";
import { machineAuthExchangeTenantScope } from "./machine-auth-exchange-tenant-scope.js";

interface ExchangeEnvironmentDeployKeySuccess {
  readonly ok: true;
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly machineIdentityId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly runtimePolicyKeyIds: readonly string[];
}

interface ExchangeEnvironmentDeployKeyFailure {
  readonly ok: false;
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly retryable: false;
}

export type ExchangeEnvironmentDeployKeyResult =
  | ExchangeEnvironmentDeployKeySuccess
  | ExchangeEnvironmentDeployKeyFailure;

export interface ExchangeEnvironmentDeployKeyInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly deployKeySecret: string;
  readonly signingSecret: string;
  readonly sql: TenantScopedSql;
  readonly runtimePolicyKeyId?: RuntimePolicyId;
  readonly request?: { requestId: RequestId };
  readonly nowEpoch?: number;
}

const FAILURE_MESSAGES: Record<string, string> = {
  [AUTH_ERROR_CODES.expired]: "Environment Deploy Key has expired.",
  [AUTH_ERROR_CODES.deployKeyInvalid]: "Environment Deploy Key is invalid.",
  [AUTH_ERROR_CODES.deployKeyDisabled]: "Environment Deploy Key is disabled.",
  [AUTH_ERROR_CODES.deployKeyWrongEnvironment]:
    "Environment Deploy Key is not authorized for this project and environment.",
  [AUTH_ERROR_CODES.deployKeyOverbroadScope]:
    "Environment Deploy Key credential scopes are overbroad.",
};

function exchangeFailure(code: AuthErrorCode): ExchangeEnvironmentDeployKeyFailure {
  return {
    ok: false,
    code,
    message: FAILURE_MESSAGES[code] ?? "Environment Deploy Key exchange was denied.",
    retryable: false,
  };
}

function authMethodAuditScope(authMethod: EnvironmentDeployKeyAuthMethodRow) {
  return machineAuthExchangeTenantScope({
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    environmentId: authMethod.environmentId,
    machineIdentityId: authMethod.machineIdentityId,
  });
}

/** True when no runtime policy key was requested or the key is on the deploy key allowlist. */
export function isRequestedRuntimePolicyKeyAllowlisted(
  authMethod: EnvironmentDeployKeyAuthMethodRow,
  runtimePolicyKeyId: RuntimePolicyId | undefined,
): boolean {
  return (
    runtimePolicyKeyId === undefined || authMethod.runtimePolicyKeyIds.includes(runtimePolicyKeyId)
  );
}

async function denyExchange(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  reasonCode: AuthErrorCode;
  denialKind: EnvironmentDeployKeyMatchFailureReason;
  request?: { requestId: RequestId };
}): Promise<ExchangeEnvironmentDeployKeyFailure> {
  await recordEnvironmentDeployKeyExchangeDenied({
    ...machineAuthExchangeTenantScope(input),
    reasonCode: input.reasonCode,
    denialKind: input.denialKind,
  });
  return exchangeFailure(input.reasonCode);
}

async function completeTrustedExchange(
  authMethod: EnvironmentDeployKeyAuthMethodRow,
  signingSecret: string,
  runtimePolicyKeyId: RuntimePolicyId | undefined,
  request?: { requestId: RequestId },
): Promise<ExchangeEnvironmentDeployKeySuccess> {
  const minted = await mintMachineAccessToken({
    machineIdentityId: authMethod.machineIdentityId,
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    environmentId: authMethod.environmentId,
    credentialScopes: authMethod.credentialScopes,
    signingSecret,
  });

  await recordEnvironmentDeployKeyExchangeSuccess({
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    environmentId: authMethod.environmentId,
    machineIdentityId: authMethod.machineIdentityId,
    deployKeyId: authMethod.id,
    ...(runtimePolicyKeyId !== undefined ? { runtimePolicyKeyId } : {}),
    ...(request !== undefined ? { request } : {}),
  });

  return {
    ok: true,
    accessToken: minted.accessToken,
    expiresAt: minted.expiresAt,
    machineIdentityId: authMethod.machineIdentityId,
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    environmentId: authMethod.environmentId,
    runtimePolicyKeyIds: [...authMethod.runtimePolicyKeyIds],
  };
}

async function denyMatchedExchange(
  input: ExchangeEnvironmentDeployKeyInput,
  matched: Extract<EnvironmentDeployKeyMatchResult, { ok: false }>,
): Promise<ExchangeEnvironmentDeployKeyFailure> {
  return denyExchange({
    ...machineAuthExchangeTenantScope({
      organizationId: input.organizationId,
      projectId: matched.authMethod?.projectId ?? input.projectId,
      environmentId: matched.authMethod?.environmentId ?? input.environmentId,
      ...(matched.authMethod?.machineIdentityId !== undefined
        ? { machineIdentityId: matched.authMethod.machineIdentityId }
        : {}),
      ...(input.request !== undefined ? { request: input.request } : {}),
    }),
    reasonCode: mapDeployKeyDenialToReasonCode(matched.reason),
    denialKind: matched.reason,
  });
}

/**
 * Exchanges an Environment Deploy Key secret for a short-lived machine access token.
 * Invalid, disabled, expired, wrong-environment, or overbroad keys fail closed before minting.
 */
export async function exchangeEnvironmentDeployKey(
  input: ExchangeEnvironmentDeployKeyInput,
): Promise<ExchangeEnvironmentDeployKeyResult> {
  const authMethods = await loadActiveEnvironmentDeployKeyAuthMethods(
    input.sql,
    input.organizationId,
  );
  const nowEpoch = input.nowEpoch ?? Math.floor(Date.now() / 1000);
  const matched = matchEnvironmentDeployKey({
    deployKeySecret: input.deployKeySecret,
    projectId: input.projectId,
    environmentId: input.environmentId,
    authMethods,
    nowEpoch,
  });

  if (!matched.ok) {
    return denyMatchedExchange(input, matched);
  }

  if (!isRequestedRuntimePolicyKeyAllowlisted(matched.authMethod, input.runtimePolicyKeyId)) {
    return denyExchange({
      ...machineAuthExchangeTenantScope({
        ...authMethodAuditScope(matched.authMethod),
        ...(input.request !== undefined ? { request: input.request } : {}),
      }),
      reasonCode: AUTH_ERROR_CODES.deployKeyInvalid,
      denialKind: "invalid",
    });
  }

  return completeTrustedExchange(
    matched.authMethod,
    input.signingSecret,
    input.runtimePolicyKeyId,
    ...(input.request !== undefined ? [input.request] : []),
  );
}
