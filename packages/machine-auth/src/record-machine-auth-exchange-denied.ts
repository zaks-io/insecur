import { type AuditEventDetails, type ProductionAuditEventCode } from "@insecur/audit";
import type {
  EnvironmentId,
  KnownErrorCode,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { writeMachineAuthDeniedAudit } from "./write-machine-auth-audit.js";

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
  await writeMachineAuthDeniedAudit(input);
}
