import {
  PRODUCTION_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditEventDetails,
} from "@insecur/audit";
import type { AuthorizationScope, CredentialScope } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type KnownErrorCode,
  type MachineAuthMethodId,
  type MachineIdentityId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type RuntimePolicyId,
} from "@insecur/domain";
import { machineAuthExchangeAuditActor } from "./machine-auth-exchange-audit.js";
import { machineAuthExchangeTenantScope } from "./machine-auth-exchange-tenant-scope.js";
import {
  machineAccessAuditDetails,
  humanOnlyGateAuditDetail,
  type MachineCredentialMethod,
} from "./machine-access-audit-metadata.js";
import {
  machineAccessTokenDenialDetail,
  machineAccessTokenDenialReasonCode,
  type MachineAccessTokenDenialKind,
} from "./machine-access-token-denial.js";
import {
  machineIdentityAuditResource,
  writeMachineAuthDeniedAudit,
} from "./write-machine-auth-audit.js";

export async function recordMachineAccessTokenMinted(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  credentialMethod: MachineCredentialMethod;
  credentialScopes: readonly CredentialScope[];
  authMethodId?: MachineAuthMethodId;
  runtimePolicyKeyId?: RuntimePolicyId;
  expiresAtEpoch: number;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAccessTokenMinted,
    outcome: "success",
    actor: machineAuthExchangeAuditActor({ machineIdentityId: input.machineIdentityId }),
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    resource: machineIdentityAuditResource(input.machineIdentityId),
    ...(input.authMethodId !== undefined
      ? {
          relatedResource: {
            type: "machine_auth_method",
            id: brandOpaqueResourceIdForPrefix("mauth", input.authMethodId),
          },
        }
      : {}),
    details: {
      ...machineAccessAuditDetails(input),
      expiresAtEpoch: input.expiresAtEpoch,
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordMachineAccessTokenUsed(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  credentialMethod: MachineCredentialMethod;
  credentialScopes: readonly CredentialScope[];
  authMethodId?: MachineAuthMethodId;
  runtimePolicyKeyId?: RuntimePolicyId;
  request?: { requestId: RequestId };
  operation?: { operationId: OperationId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAccessTokenUsed,
    outcome: "success",
    actor: machineAuthExchangeAuditActor({ machineIdentityId: input.machineIdentityId }),
    ...machineAuthExchangeTenantScope(input),
    resource: machineIdentityAuditResource(input.machineIdentityId),
    details: machineAccessAuditDetails(input),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

export async function recordMachineAccessTokenDenied(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  credentialMethod?: MachineCredentialMethod;
  credentialScopes?: readonly CredentialScope[];
  authMethodId?: MachineAuthMethodId;
  denialKind: MachineAccessTokenDenialKind;
  request?: { requestId: RequestId };
  operation?: { operationId: OperationId };
  details?: AuditEventDetails;
}): Promise<void> {
  const reasonCode = machineAccessTokenDenialReasonCode(input.denialKind);
  const details: AuditEventDetails = {
    ...machineAccessTokenDenialDetail(input.denialKind),
    ...(input.credentialMethod !== undefined
      ? machineAccessAuditDetails({
          credentialMethod: input.credentialMethod,
          credentialScopes: input.credentialScopes ?? [],
          ...(input.authMethodId !== undefined ? { authMethodId: input.authMethodId } : {}),
        })
      : {}),
    ...input.details,
  };

  await writeMachineAuthDeniedAudit({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAccessTokenDenied,
    ...machineAuthExchangeTenantScope(input),
    reasonCode,
    details,
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

export async function recordMachineAuthorizationDenied(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  credentialMethod?: MachineCredentialMethod;
  credentialScopes?: readonly CredentialScope[];
  reasonCode: KnownErrorCode;
  details: AuditEventDetails;
  request?: { requestId: RequestId };
  operation?: { operationId: OperationId };
}): Promise<void> {
  const scopeDetails =
    input.credentialMethod !== undefined
      ? machineAccessAuditDetails({
          credentialMethod: input.credentialMethod,
          credentialScopes: input.credentialScopes ?? [],
        })
      : {};

  await writeMachineAuthDeniedAudit({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAuthorizationDenied,
    ...machineAuthExchangeTenantScope(input),
    machineIdentityId: input.machineIdentityId,
    reasonCode: input.reasonCode,
    details: { ...scopeDetails, ...input.details },
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

export async function recordMachineHumanOnlyGateDenied(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  forbiddenScope: AuthorizationScope;
  credentialMethod?: MachineCredentialMethod;
  credentialScopes?: readonly CredentialScope[];
  request?: { requestId: RequestId };
  operation?: { operationId: OperationId };
}): Promise<void> {
  await recordMachineAuthorizationDenied({
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    machineIdentityId: input.machineIdentityId,
    ...(input.credentialMethod !== undefined ? { credentialMethod: input.credentialMethod } : {}),
    ...(input.credentialScopes !== undefined ? { credentialScopes: input.credentialScopes } : {}),
    reasonCode: AUTH_ERROR_CODES.insufficientScope,
    details: humanOnlyGateAuditDetail(input.forbiddenScope),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}
