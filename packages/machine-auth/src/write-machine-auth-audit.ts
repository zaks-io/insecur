import {
  writeAuditEvent,
  type AuditEventDetails,
  type AuditResourceRef,
  type ProductionAuditEventCode,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type KnownErrorCode,
  type MachineIdentityId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import { machineAuthExchangeAuditActor } from "./machine-auth-exchange-audit.js";

export function machineIdentityAuditResource(
  machineIdentityId: MachineIdentityId,
): AuditResourceRef {
  return {
    type: "machine_identity",
    id: brandOpaqueResourceIdForPrefix("mach", machineIdentityId),
  };
}

export async function writeMachineAuthDeniedAudit(input: {
  eventCode: ProductionAuditEventCode;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  reasonCode: KnownErrorCode;
  details: AuditEventDetails;
  request?: { requestId: RequestId };
  operation?: { operationId: OperationId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: input.eventCode,
    outcome: "denied",
    actor: machineAuthExchangeAuditActor(
      input.machineIdentityId !== undefined ? { machineIdentityId: input.machineIdentityId } : {},
    ),
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    denial: { reasonCode: input.reasonCode },
    details: input.details,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}
