import {
  PRODUCTION_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditEventDetails,
  type AuditEventCode,
  type AuditEventResult,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  APP_CONNECTION_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  type AppConnectionErrorCode,
  type AppConnectionId,
  type AuthErrorCode,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";

import type { CloudflareScopedTokenVerifyResult } from "./cloudflare-scoped-token-port.js";
import { toCloudflareTokenStatusAuditCode } from "./cloudflare-scoped-token-metadata.js";
import { toGithubInstallationStatusAuditCode } from "./github-app-metadata.js";

function connectionResource(appConnectionId: AppConnectionId) {
  return {
    type: "app_connection" as const,
    id: brandOpaqueResourceIdForPrefix("conn", appConnectionId),
  };
}

function validationDetails(result: CloudflareScopedTokenVerifyResult): AuditEventDetails {
  return {
    tokenStatus: toCloudflareTokenStatusAuditCode(result.tokenStatus),
    workerScriptReachable: result.workerScriptReachable,
    hasBoundaryWarning: result.hasBoundaryWarning,
  };
}

export interface GithubConnectionValidationAuditDetails {
  readonly installationStatus: "active" | "suspended";
  readonly accessibleRepositoryCount: number;
  readonly repositoriesWithinBoundary: boolean;
}

function githubValidationDetails(
  result: GithubConnectionValidationAuditDetails,
): AuditEventDetails {
  return {
    installationStatus: toGithubInstallationStatusAuditCode(result.installationStatus),
    accessibleRepositoryCount: result.accessibleRepositoryCount,
    repositoriesWithinBoundary: result.repositoriesWithinBoundary,
  };
}

interface ConnectionAuditScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId?: ProjectId;
  readonly request?: AuditRequestRef;
}

async function writeConnectionSuccessAudit(
  input: ConnectionAuditScope & {
    readonly eventCode: AuditEventCode;
    readonly appConnectionId: AppConnectionId;
    readonly details?: AuditEventDetails;
  },
): Promise<AuditEventResult> {
  return writeAuditEvent({
    eventCode: input.eventCode,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    resource: connectionResource(input.appConnectionId),
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

async function writeConnectionDeniedAudit(
  input: ConnectionAuditScope & {
    readonly eventCode: AuditEventCode;
    readonly reasonCode: KnownErrorCode;
    readonly appConnectionId?: AppConnectionId;
  },
): Promise<AuditEventResult> {
  return writeAuditEvent({
    eventCode: input.eventCode,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.appConnectionId !== undefined
      ? { resource: connectionResource(input.appConnectionId) }
      : {}),
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordConnectionCreateDenied(
  input: ConnectionAuditScope & { readonly reasonCode: KnownErrorCode },
): Promise<AuditEventResult> {
  return writeConnectionDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionCreateDenied,
  });
}

export async function recordConnectionCreated(
  input: ConnectionAuditScope & { readonly appConnectionId: AppConnectionId },
): Promise<AuditEventResult> {
  return writeConnectionSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionCreated,
  });
}

export async function recordConnectionCredentialAttachDenied(
  input: ConnectionAuditScope & {
    readonly reasonCode: KnownErrorCode;
    readonly appConnectionId?: AppConnectionId;
  },
): Promise<AuditEventResult> {
  return writeConnectionDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionCredentialAttachDenied,
  });
}

export async function recordConnectionCredentialAttached(
  input: ConnectionAuditScope & { readonly appConnectionId: AppConnectionId },
): Promise<AuditEventResult> {
  return writeConnectionSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionCredentialAttached,
  });
}

export async function recordConnectionValidationDenied(
  input: ConnectionAuditScope & {
    readonly reasonCode: KnownErrorCode;
    readonly appConnectionId?: AppConnectionId;
  },
): Promise<AuditEventResult> {
  return writeConnectionDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionValidationDenied,
  });
}

export async function recordConnectionValidated(
  input: ConnectionAuditScope & {
    readonly appConnectionId: AppConnectionId;
    readonly validation: CloudflareScopedTokenVerifyResult;
  },
): Promise<AuditEventResult> {
  return writeConnectionSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionValidated,
    details: validationDetails(input.validation),
  });
}

export async function recordGithubConnectionValidated(
  input: ConnectionAuditScope & {
    readonly appConnectionId: AppConnectionId;
    readonly validation: GithubConnectionValidationAuditDetails;
  },
): Promise<AuditEventResult> {
  return writeConnectionSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionValidated,
    details: githubValidationDetails(input.validation),
  });
}

export async function recordConnectionDisableDenied(
  input: ConnectionAuditScope & {
    readonly reasonCode: KnownErrorCode;
    readonly appConnectionId?: AppConnectionId;
  },
): Promise<AuditEventResult> {
  return writeConnectionDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionDisableDenied,
  });
}

export async function recordConnectionDisabled(
  input: ConnectionAuditScope & { readonly appConnectionId: AppConnectionId },
): Promise<AuditEventResult> {
  return writeConnectionSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionDisabled,
  });
}

export function toConnectionAuditReasonCode(
  error: unknown,
): AppConnectionErrorCode | AuthErrorCode {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code as AppConnectionErrorCode | AuthErrorCode;
  }
  return APP_CONNECTION_ERROR_CODES.validationFailed;
}
