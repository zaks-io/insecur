import {
  PRODUCTION_AUDIT_EVENT_CODES,
  type AuditEventDetails,
  writeAuditEvent,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  type AuthErrorCode,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type MachineIdentityId,
  type RequestId,
} from "@insecur/domain";
import { machineAuthExchangeAuditActor } from "./machine-auth-exchange-audit.js";
import { machineAuthExchangeTenantScope } from "./machine-auth-exchange-tenant-scope.js";
import { recordMachineAuthExchangeDenied } from "./record-machine-auth-exchange-denied.js";
import {
  machineAccessAuditDetails,
  machineCredentialMethodDetail,
} from "./machine-access-audit-metadata.js";
import { machineIdentityAuditResource } from "./write-machine-auth-audit.js";
import type { OidcTrustMatchFailureReason } from "./match-github-actions-oidc-trust.js";
import type { CredentialScope } from "@insecur/access";

function oidcDenialDetail(reason: OidcTrustMatchFailureReason | "malformed"): AuditEventDetails {
  return { oidcDenialKind: `auth.oidc_denial.${reason}` };
}

export async function recordGitHubActionsOidcExchangeSuccess(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  credentialScopes: readonly CredentialScope[];
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchanged,
    outcome: "success",
    actor: machineAuthExchangeAuditActor({ machineIdentityId: input.machineIdentityId }),
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    resource: machineIdentityAuditResource(input.machineIdentityId),
    details: machineAccessAuditDetails({
      credentialMethod: "github_actions_oidc",
      credentialScopes: input.credentialScopes,
    }),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordGitHubActionsOidcExchangeDenied(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  reasonCode: KnownErrorCode;
  oidcDenialKind: OidcTrustMatchFailureReason | "malformed";
  request?: { requestId: RequestId };
}): Promise<void> {
  await recordMachineAuthExchangeDenied({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchangeDenied,
    ...machineAuthExchangeTenantScope(input),
    reasonCode: input.reasonCode,
    details: {
      ...oidcDenialDetail(input.oidcDenialKind),
      ...machineCredentialMethodDetail("github_actions_oidc"),
    },
  });
}

export function mapVerificationFailureToReasonCode(
  reason: "malformed" | "invalid" | "expired",
): AuthErrorCode {
  return reason === "expired" ? AUTH_ERROR_CODES.expired : AUTH_ERROR_CODES.invalid;
}
