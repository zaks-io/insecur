import {
  PRODUCTION_AUDIT_EVENT_CODES,
  type AuditActorRef,
  type AuditEventDetails,
  writeAuditEvent,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  type AuthErrorCode,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type EnvironmentId,
  type MachineIdentityId,
  type RequestId,
} from "@insecur/domain";
import type { OidcTrustMatchFailureReason } from "./match-github-actions-oidc-trust.js";

function auditActorForExchange(input: { machineIdentityId?: MachineIdentityId }): AuditActorRef {
  if (input.machineIdentityId !== undefined) {
    return { type: "machine", machineIdentityId: input.machineIdentityId };
  }
  return { type: "ci_exchange" };
}

function oidcDenialDetail(reason: OidcTrustMatchFailureReason | "malformed"): AuditEventDetails {
  return { oidcDenialKind: `auth.oidc_denial.${reason}` };
}

export async function recordGitHubActionsOidcExchangeSuccess(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchanged,
    outcome: "success",
    actor: auditActorForExchange({ machineIdentityId: input.machineIdentityId }),
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    resource: {
      type: "machine_identity",
      id: brandOpaqueResourceIdForPrefix("mach", input.machineIdentityId),
    },
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
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchangeDenied,
    outcome: "denied",
    actor: auditActorForExchange(
      input.machineIdentityId !== undefined ? { machineIdentityId: input.machineIdentityId } : {},
    ),
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    denial: { reasonCode: input.reasonCode },
    details: oidcDenialDetail(input.oidcDenialKind),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export function mapVerificationFailureToReasonCode(
  reason: "malformed" | "invalid" | "expired",
): AuthErrorCode {
  return reason === "expired" ? AUTH_ERROR_CODES.expired : AUTH_ERROR_CODES.invalid;
}
