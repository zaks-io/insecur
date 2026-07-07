import {
  PRODUCTION_AUDIT_EVENT_CODES,
  type AuditEventDetails,
  writeAuditEvent,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  type AuthErrorCode,
  type EnvironmentId,
  type KnownErrorCode,
  type MachineAuthMethodId,
  type MachineIdentityId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type RuntimePolicyId,
} from "@insecur/domain";
import { machineAuthExchangeAuditActor } from "./machine-auth-exchange-audit.js";
import { machineAuthExchangeTenantScope } from "./machine-auth-exchange-tenant-scope.js";
import { recordMachineAuthExchangeDenied } from "./record-machine-auth-exchange-denied.js";

export type DeployKeyExchangeDenialKind =
  "invalid" | "disabled" | "expired" | "wrong_environment" | "overbroad_scope";

function deployKeyDenialDetail(kind: DeployKeyExchangeDenialKind): AuditEventDetails {
  return { deployKeyDenialKind: `auth.deploy_key_denial.${kind}` };
}

export async function recordEnvironmentDeployKeyExchangeSuccess(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  machineIdentityId: MachineIdentityId;
  deployKeyId: MachineAuthMethodId;
  runtimePolicyKeyId?: RuntimePolicyId;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineDeployKeyExchanged,
    outcome: "success",
    actor: machineAuthExchangeAuditActor({ machineIdentityId: input.machineIdentityId }),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: {
      type: "machine_auth_method",
      id: brandOpaqueResourceIdForPrefix("mauth", input.deployKeyId),
    },
    ...(input.runtimePolicyKeyId !== undefined
      ? {
          details: {
            runtimePolicyKeyId: input.runtimePolicyKeyId,
          },
        }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordEnvironmentDeployKeyExchangeDenied(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  deployKeyId?: MachineAuthMethodId;
  reasonCode: KnownErrorCode;
  denialKind: DeployKeyExchangeDenialKind;
  request?: { requestId: RequestId };
}): Promise<void> {
  await recordMachineAuthExchangeDenied({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineDeployKeyExchangeDenied,
    ...machineAuthExchangeTenantScope(input),
    reasonCode: input.reasonCode,
    details: deployKeyDenialDetail(input.denialKind),
  });
}

export function mapDeployKeyDenialToReasonCode(kind: DeployKeyExchangeDenialKind): AuthErrorCode {
  switch (kind) {
    case "disabled":
      return AUTH_ERROR_CODES.deployKeyDisabled;
    case "expired":
      return AUTH_ERROR_CODES.expired;
    case "wrong_environment":
      return AUTH_ERROR_CODES.deployKeyWrongEnvironment;
    case "overbroad_scope":
      return AUTH_ERROR_CODES.deployKeyOverbroadScope;
    case "invalid":
    default:
      return AUTH_ERROR_CODES.deployKeyInvalid;
  }
}
