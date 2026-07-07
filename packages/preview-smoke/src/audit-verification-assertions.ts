import {
  assertAuditExportPayloadIsMetadataOnly,
  AUDIT_SUCCESS_RESULT_CODE,
  FIRST_VALUE_AUDIT_EVENT_CODES,
  scanAuditExportForForbiddenSensitiveValues,
  toAuditExportEventPayload,
} from "@insecur/audit";
import { INJECTION_ERROR_CODES } from "@insecur/domain";

import type { AuditEventRow } from "./audit-verification-types.js";

const FIRST_VALUE_SUCCESS_EVENT_CODES = [
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
  FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
] as const;

const FIRST_VALUE_DENIED_EVENT_CODES = [
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
] as const;

export function assertRequiredSuccessAuditEvents(
  auditRows: readonly AuditEventRow[],
  grantId: string | undefined,
): string[] {
  const verified: string[] = [];
  for (const eventCode of FIRST_VALUE_SUCCESS_EVENT_CODES) {
    const match = findSuccessfulAuditEvent(auditRows, eventCode, grantId);
    if (match === undefined) {
      throw new Error(`Missing successful audit event ${eventCode}.`);
    }
    verified.push(eventCode);
  }
  return verified;
}

export function assertRequiredDeniedAuditEvents(
  auditRows: readonly AuditEventRow[],
  grantId: string | undefined,
): string[] {
  const verified: string[] = [];
  for (const eventCode of FIRST_VALUE_DENIED_EVENT_CODES) {
    const match = auditRows.find((row) => matchesDeniedAuditEvent(row, eventCode, grantId));
    if (match === undefined) {
      throw new Error(`Missing denied audit event ${eventCode}.`);
    }
    if (match.resultCode !== INJECTION_ERROR_CODES.grantDenied) {
      throw new Error(
        `Expected ${eventCode} result ${INJECTION_ERROR_CODES.grantDenied}, received ${match.resultCode}.`,
      );
    }
    verified.push(eventCode);
  }
  return verified;
}

export function assertAuditRowsMetadataOnly(auditRows: readonly AuditEventRow[]): void {
  for (const row of auditRows) {
    const payload = toAuditExportEventPayload({
      actorMachineIdentityId: row.actorMachineIdentityId,
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      details: row.details,
      environmentId: row.environmentId,
      eventCode: row.eventCode,
      id: row.id,
      operationId: row.operationId,
      orgId: row.orgId,
      outcome: row.outcome,
      projectId: row.projectId,
      relatedResourceId: row.relatedResourceId,
      relatedResourceType: row.relatedResourceType,
      requestId: row.requestId,
      resourceId: row.resourceId,
      resourceType: row.resourceType,
      resultCode: row.resultCode,
    } as Parameters<typeof toAuditExportEventPayload>[0]);
    assertAuditExportPayloadIsMetadataOnly(payload);
    const forbiddenKey = scanAuditExportForForbiddenSensitiveValues(payload);
    if (forbiddenKey !== null) {
      throw new Error(
        `audit event ${row.id} contains forbidden sensitive value key: ${forbiddenKey}`,
      );
    }
  }
}

export function assertRecordsFreeOfSensitivePatterns(
  redactor: (value: unknown) => string,
  label: string,
  records: readonly unknown[],
): void {
  for (const [index, record] of records.entries()) {
    const redacted = redactor(record);
    if (redacted.includes("[redacted]")) {
      throw new Error(`${label} record ${String(index)} leaked a sensitive value after redaction.`);
    }
  }
}

function matchesDeniedAuditEvent(
  row: AuditEventRow,
  eventCode: string,
  grantId: string | undefined,
): boolean {
  if (row.eventCode !== eventCode || row.outcome !== "denied") {
    return false;
  }
  if (grantId === undefined) {
    return true;
  }
  return row.resourceId === grantId || row.relatedResourceId === grantId;
}

function findSuccessfulAuditEvent(
  auditRows: readonly AuditEventRow[],
  eventCode: string,
  grantId: string | undefined,
): AuditEventRow | undefined {
  return auditRows.find((row) => {
    if (
      row.eventCode !== eventCode ||
      row.outcome !== "success" ||
      row.resultCode !== AUDIT_SUCCESS_RESULT_CODE
    ) {
      return false;
    }
    if (grantId === undefined) {
      return true;
    }
    if (
      eventCode === FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued ||
      eventCode === FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed
    ) {
      return row.resourceId === grantId || row.relatedResourceId === grantId;
    }
    return true;
  });
}
