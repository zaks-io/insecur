import type {
  AuthErrorCode,
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { loadActiveGitHubActionsOidcAuthMethods } from "./load-github-actions-oidc-auth-methods.js";
import {
  matchGitHubActionsOidcTrust,
  type OidcTrustMatchFailureReason,
  type OidcTrustMatchResult,
} from "./match-github-actions-oidc-trust.js";
import { mintMachineAccessToken } from "./machine-access-token.js";
import {
  verifyGitHubActionsOidcToken,
  type GitHubActionsOidcJwksPort,
} from "./github-actions-oidc-verifier.js";
import type { GitHubActionsOidcAuthMethodRow } from "./github-actions-oidc-auth-method-row.js";
import {
  mapVerificationFailureToReasonCode,
  recordGitHubActionsOidcExchangeDenied,
  recordGitHubActionsOidcExchangeSuccess,
} from "./record-github-actions-oidc-exchange-audit.js";
import { recordTrustedExchangeMintAudit } from "./record-trusted-exchange-mint-audit.js";

interface ExchangeGitHubActionsOidcSuccess {
  readonly ok: true;
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly machineIdentityId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environmentId?: string;
}

interface ExchangeGitHubActionsOidcFailure {
  readonly ok: false;
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly retryable: false;
}

export type ExchangeGitHubActionsOidcResult =
  ExchangeGitHubActionsOidcSuccess | ExchangeGitHubActionsOidcFailure;

export interface ExchangeGitHubActionsOidcInput {
  readonly organizationId: OrganizationId;
  readonly oidcToken: string;
  readonly signingSecret: string;
  readonly jwks: GitHubActionsOidcJwksPort;
  readonly sql: TenantScopedSql;
  readonly request?: { requestId: RequestId };
  readonly nowEpoch?: number;
}

const FAILURE_MESSAGES: Record<string, string> = {
  [AUTH_ERROR_CODES.expired]: "GitHub Actions OIDC token has expired.",
  [AUTH_ERROR_CODES.invalid]: "GitHub Actions OIDC token is invalid.",
  [AUTH_ERROR_CODES.oidcWrongAudience]: "GitHub Actions OIDC token audience is not trusted.",
  [AUTH_ERROR_CODES.oidcWrongRepository]:
    "GitHub Actions OIDC token repository is not trusted for this Organization.",
  [AUTH_ERROR_CODES.oidcWrongEnvironment]:
    "GitHub Actions OIDC token environment is not trusted for this auth method.",
  [AUTH_ERROR_CODES.oidcUntrustedSource]:
    "GitHub Actions OIDC token does not match a unique trusted source.",
};

function exchangeFailure(code: AuthErrorCode): ExchangeGitHubActionsOidcFailure {
  return {
    ok: false,
    code,
    message: FAILURE_MESSAGES[code] ?? "GitHub Actions OIDC exchange was denied.",
    retryable: false,
  };
}

function authMethodAuditScope(authMethod: GitHubActionsOidcAuthMethodRow) {
  return {
    projectId: authMethod.projectId,
    machineIdentityId: authMethod.machineIdentityId,
    ...(authMethod.environmentId !== null ? { environmentId: authMethod.environmentId } : {}),
  };
}

async function denyExchange(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  reasonCode: AuthErrorCode;
  oidcDenialKind: OidcTrustMatchFailureReason | "malformed";
  request?: { requestId: RequestId };
}): Promise<ExchangeGitHubActionsOidcFailure> {
  await recordGitHubActionsOidcExchangeDenied(input);
  return exchangeFailure(input.reasonCode);
}

async function completeTrustedExchange(
  authMethod: GitHubActionsOidcAuthMethodRow,
  signingSecret: string,
  request?: { requestId: RequestId },
): Promise<ExchangeGitHubActionsOidcSuccess> {
  const minted = await mintMachineAccessToken({
    machineIdentityId: authMethod.machineIdentityId,
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    ...(authMethod.environmentId !== null ? { environmentId: authMethod.environmentId } : {}),
    credentialScopes: authMethod.credentialScopes,
    signingSecret,
  });

  await recordGitHubActionsOidcExchangeSuccess({
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    ...(authMethod.environmentId !== null ? { environmentId: authMethod.environmentId } : {}),
    machineIdentityId: authMethod.machineIdentityId,
    credentialScopes: authMethod.credentialScopes,
    ...(request !== undefined ? { request } : {}),
  });

  await recordTrustedExchangeMintAudit({
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    ...(authMethod.environmentId !== null ? { environmentId: authMethod.environmentId } : {}),
    machineIdentityId: authMethod.machineIdentityId,
    credentialMethod: "github_actions_oidc",
    credentialScopes: authMethod.credentialScopes,
    minted,
    ...(request !== undefined ? { request } : {}),
  });

  return {
    ok: true,
    accessToken: minted.accessToken,
    expiresAt: minted.expiresAt,
    machineIdentityId: authMethod.machineIdentityId,
    organizationId: authMethod.organizationId,
    projectId: authMethod.projectId,
    ...(authMethod.environmentId !== null ? { environmentId: authMethod.environmentId } : {}),
  };
}

async function denyTrustMatch(
  organizationId: OrganizationId,
  matched: Extract<OidcTrustMatchResult, { ok: false }>,
  request?: { requestId: RequestId },
): Promise<ExchangeGitHubActionsOidcFailure> {
  return denyExchange({
    organizationId,
    ...(matched.authMethod !== undefined ? authMethodAuditScope(matched.authMethod) : {}),
    reasonCode: matched.reasonCode,
    oidcDenialKind: matched.reason,
    ...(request !== undefined ? { request } : {}),
  });
}

/**
 * Exchanges a GitHub Actions OIDC token for a short-lived machine access token.
 * Invalid or mismatched claims fail closed before token minting.
 */
export async function exchangeGitHubActionsOidc(
  input: ExchangeGitHubActionsOidcInput,
): Promise<ExchangeGitHubActionsOidcResult> {
  const verified = await verifyGitHubActionsOidcToken(input.oidcToken, input.jwks, input.nowEpoch);
  if (!verified.ok) {
    return denyExchange({
      organizationId: input.organizationId,
      reasonCode: mapVerificationFailureToReasonCode(verified.reason),
      oidcDenialKind: verified.reason,
      ...(input.request !== undefined ? { request: input.request } : {}),
    });
  }

  const authMethods = await loadActiveGitHubActionsOidcAuthMethods(input.sql, input.organizationId);
  const nowEpoch = input.nowEpoch ?? Math.floor(Date.now() / 1000);
  const matched = matchGitHubActionsOidcTrust(verified.claims, authMethods, nowEpoch);
  if (!matched.ok) {
    return denyTrustMatch(input.organizationId, matched, input.request);
  }

  return completeTrustedExchange(matched.authMethod, input.signingSecret, input.request);
}
