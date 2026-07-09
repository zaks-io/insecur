import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import {
  assertAuditRowsMetadataOnly,
  assertRecordsFreeOfSensitivePatterns,
  assertRequiredDeniedAuditEvents,
  assertRequiredSuccessAuditEvents,
} from "./audit-verification-assertions.js";
import {
  loadFeedbackRow,
  loadOperationRow,
  loadOrganizationAuditEvents,
  withServiceRoleSql,
} from "./audit-verification-db.js";
import type {
  DeniedAuditExpectation,
  DeniedAuditVerificationInput,
  DeniedAuditVerificationResult,
  FirstValueAuditVerificationInput,
  FirstValueAuditVerificationResult,
} from "./audit-verification-types.js";

export type {
  DeniedAuditExpectation,
  DeniedAuditVerificationInput,
  DeniedAuditVerificationResult,
  FirstValueAuditVerificationInput,
  FirstValueAuditVerificationResult,
} from "./audit-verification-types.js";

export async function verifyFirstValueAuditEvidence(
  input: FirstValueAuditVerificationInput,
): Promise<FirstValueAuditVerificationResult> {
  return withServiceRoleSql(input.databaseUrl, async (sql) => {
    const auditRows = await loadOrganizationAuditEvents(sql, input.organizationId);
    const verifiedEventCodes = assertRequiredSuccessAuditEvents(auditRows, input.grantId);
    const verifiedDeniedEventCodes = assertRequiredDeniedAuditEvents(auditRows, input.grantId);

    assertAuditRowsMetadataOnly(auditRows);
    assertRecordsFreeOfSensitivePatterns(input.redactor, "audit_events", auditRows);

    const feedbackPresent = await verifyFeedbackEvidence(sql, input);
    await verifyOperationEvidence(sql, input);

    return {
      auditEventCount: auditRows.length,
      feedbackPresent,
      verifiedDeniedEventCodes,
      verifiedEventCodes,
    };
  });
}

export async function verifyDeniedAuditEvidence(
  input: DeniedAuditVerificationInput,
): Promise<DeniedAuditVerificationResult> {
  return withServiceRoleSql(input.databaseUrl, async (sql) => {
    const auditRows = await loadOrganizationAuditEvents(sql, input.organizationId);
    const verifiedDeniedEventCodes = assertDeniedExpectations(auditRows, input);

    assertAuditRowsMetadataOnly(auditRows);
    assertRecordsFreeOfSensitivePatterns(input.redactor, "audit_events", auditRows);

    return { verifiedDeniedEventCodes };
  });
}

export const NEGATIVE_PROBE_DENIED_AUDIT_EXPECTATIONS = [
  {
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
    resultCode: AUTH_ERROR_CODES.insufficientScope,
  },
  {
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied,
    resultCode: AUTH_ERROR_CODES.insufficientScope,
  },
] as const satisfies readonly DeniedAuditExpectation[];

export function annotateVerifiedAuditEventCodes(
  annotate: (annotation: { description: string; type: string }) => void,
  result: Pick<
    FirstValueAuditVerificationResult,
    "verifiedDeniedEventCodes" | "verifiedEventCodes"
  >,
): void {
  annotate({
    description: [...result.verifiedEventCodes, ...result.verifiedDeniedEventCodes].join(", "),
    type: "audit.verified_event_codes",
  });
}

async function verifyFeedbackEvidence(
  sql: Parameters<typeof loadFeedbackRow>[0],
  input: FirstValueAuditVerificationInput,
): Promise<boolean> {
  if (input.feedbackId === undefined) {
    return false;
  }

  const feedbackRow = await loadFeedbackRow(sql, input.organizationId, input.feedbackId);
  if (feedbackRow === undefined) {
    throw new Error(
      `Expected design-partner feedback row ${input.feedbackId} for organization ${input.organizationId}.`,
    );
  }
  assertRecordsFreeOfSensitivePatterns(input.redactor, "first_value_feedback", [feedbackRow]);
  return true;
}

async function verifyOperationEvidence(
  sql: Parameters<typeof loadOperationRow>[0],
  input: FirstValueAuditVerificationInput,
): Promise<void> {
  if (input.operationId === undefined) {
    return;
  }

  const operationRow = await loadOperationRow(sql, input.organizationId, input.operationId);
  if (operationRow === undefined) {
    throw new Error(
      `Expected operation row ${input.operationId} for organization ${input.organizationId}.`,
    );
  }
  assertRecordsFreeOfSensitivePatterns(input.redactor, "operations", [operationRow]);
}

function assertDeniedExpectations(
  auditRows: Awaited<ReturnType<typeof loadOrganizationAuditEvents>>,
  input: DeniedAuditVerificationInput,
): string[] {
  const verifiedDeniedEventCodes: string[] = [];
  for (const expectation of input.expectations) {
    const match = auditRows.find(
      (row) =>
        row.eventCode === expectation.eventCode &&
        row.outcome === "denied" &&
        row.resultCode === expectation.resultCode,
    );
    if (match === undefined) {
      throw new Error(
        `Missing denied audit event ${expectation.eventCode} with result ${expectation.resultCode} for organization ${input.organizationId}.`,
      );
    }
    verifiedDeniedEventCodes.push(expectation.eventCode);
  }
  return verifiedDeniedEventCodes;
}
