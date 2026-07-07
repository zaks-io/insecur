import type { FirstValueAuditEventCode } from "@insecur/audit";

export interface AuditEventRow {
  actorMachineIdentityId: string | null;
  actorType: string;
  actorUserId: string | null;
  createdAt: Date;
  details: Record<string, unknown> | null;
  environmentId: string | null;
  eventCode: string;
  id: string;
  operationId: string | null;
  orgId: string;
  outcome: string;
  projectId: string | null;
  relatedResourceId: string | null;
  relatedResourceType: string | null;
  requestId: string | null;
  resourceId: string | null;
  resourceType: string | null;
  resultCode: string;
}

export interface FeedbackRow {
  actorUserId: string;
  feedbackKind: string;
  grantId: string | null;
  id: string;
  note: string;
  operationId: string | null;
  orgId: string;
  requestId: string | null;
}

export interface OperationRow {
  id: string;
  intentCode: string;
  orgId: string;
  progress: Record<string, unknown>;
  state: string;
}

export interface FirstValueAuditVerificationInput {
  databaseUrl: string;
  feedbackId?: string;
  grantId?: string;
  operationId?: string;
  organizationId: string;
  redactor: (value: unknown) => string;
}

export interface FirstValueAuditVerificationResult {
  auditEventCount: number;
  feedbackPresent: boolean;
  verifiedDeniedEventCodes: string[];
  verifiedEventCodes: string[];
}

export interface DeniedAuditExpectation {
  eventCode: FirstValueAuditEventCode;
  resultCode: string;
}

export interface DeniedAuditVerificationInput {
  databaseUrl: string;
  expectations: readonly DeniedAuditExpectation[];
  organizationId: string;
  redactor: (value: unknown) => string;
}

export interface DeniedAuditVerificationResult {
  verifiedDeniedEventCodes: string[];
}
