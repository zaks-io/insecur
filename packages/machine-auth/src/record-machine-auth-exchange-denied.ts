import {
  writeAuditEvent,
  type AuditEventDetails,
  type ProductionAuditEventCode,
} from "@insecur/audit";
import type {
  EnvironmentId,
  KnownErrorCode,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { machineAuthExchangeAuditActor } from "./machine-auth-exchange-audit.js";

export async function recordMachineAuthExchangeDenied(input: {
  eventCode: ProductionAuditEventCode;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  reasonCode: KnownErrorCode;
  details: AuditEventDetails;
  request?: { requestId: RequestId };
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
  });
}
