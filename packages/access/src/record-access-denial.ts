import { recordAccessDeniedAudit } from "@insecur/audit";
import type {
  AuditActorRef,
  AuditEventResult,
  AuditOperationRef,
  AuditRequestRef,
  AuditResourceRef,
} from "@insecur/audit";
import type { EnvironmentId, KnownErrorCode, OrganizationId, ProjectId } from "@insecur/domain";

export interface RecordAccessDenialInput {
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

/**
 * Records a metadata-only denied authorization attempt through the Audit Event Writer.
 */
export async function recordAccessDenial(
  input: RecordAccessDenialInput,
): Promise<AuditEventResult> {
  return recordAccessDeniedAudit(input);
}
