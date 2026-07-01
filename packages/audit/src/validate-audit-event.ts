import {
  assertMetadataOnlyValue,
  assertMetadataSafeDetailMap,
  AUDIT_ERROR_CODES,
  type AuditErrorCode,
  isStableDottedCode,
  MetadataEnvelopeValidationError,
  type KnownErrorCode,
} from "@insecur/domain";
import {
  AUDIT_SUCCESS_RESULT_CODE,
  DENIED_AUDIT_EVENT_CODES,
  isAuditEventCode,
  SUCCESS_AUDIT_EVENT_CODES,
  type AuditEventCode,
} from "./audit-event-codes.js";
import type { AuditEventInput } from "./audit-types.js";

export class AuditEventValidationError extends Error {
  readonly code: AuditErrorCode = AUDIT_ERROR_CODES.eventInvalid;
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "AuditEventValidationError";
  }
}

function assertKnownErrorCode(value: string): asserts value is KnownErrorCode {
  if (!isStableDottedCode(value)) {
    throw new AuditEventValidationError(
      "denial reasonCode must be a stable dotted code (e.g. auth.insufficient_scope)",
    );
  }
}

function assertOutcomeMatchesEventCode(
  eventCode: AuditEventCode,
  outcome: "success" | "denied",
): void {
  if (outcome === "denied" && !DENIED_AUDIT_EVENT_CODES.has(eventCode)) {
    throw new AuditEventValidationError(
      `eventCode ${eventCode} is not a denied-action audit event name`,
    );
  }
  if (outcome === "success" && !SUCCESS_AUDIT_EVENT_CODES.has(eventCode)) {
    throw new AuditEventValidationError(
      `eventCode ${eventCode} is not a successful-action audit event name`,
    );
  }
}

function assertMetadataOnlyAuditEvent(event: AuditEventInput): void {
  try {
    assertMetadataOnlyValue(event);
  } catch (error) {
    if (error instanceof MetadataEnvelopeValidationError) {
      throw new AuditEventValidationError(error.message);
    }
    throw error;
  }
}

function assertTenantScope(event: AuditEventInput): void {
  if (event.environmentId !== undefined && event.projectId === undefined) {
    throw new AuditEventValidationError(
      "environment-scoped audit events require projectId for tenant qualification",
    );
  }
}

function assertMetadataSafeAuditDetails(event: AuditEventInput): void {
  if (event.details === undefined) {
    return;
  }
  try {
    assertMetadataSafeDetailMap(event.details);
  } catch (error) {
    if (error instanceof Error) {
      throw new AuditEventValidationError(error.message);
    }
    throw error;
  }
}

function assertDenialMetadata(event: AuditEventInput): void {
  if (event.outcome !== "denied") {
    if ("denial" in event) {
      throw new AuditEventValidationError(
        "successful audit events must not include denial metadata",
      );
    }
    return;
  }

  if (!("denial" in event)) {
    throw new AuditEventValidationError("denied audit events require denial.reasonCode metadata");
  }
  assertKnownErrorCode(event.denial.reasonCode);
  if (event.denial.reasonCode === AUDIT_SUCCESS_RESULT_CODE) {
    throw new AuditEventValidationError("denied audit events cannot use audit.succeeded");
  }
}

/**
 * Rejects free-form or secret-bearing payloads and enforces outcome/event-code pairing.
 */
export function validateAuditEventInput(event: AuditEventInput): void {
  const eventCode = event.eventCode;
  if (!isAuditEventCode(eventCode)) {
    throw new AuditEventValidationError(`unknown audit eventCode: ${String(eventCode)}`);
  }

  assertMetadataOnlyAuditEvent(event);
  assertMetadataSafeAuditDetails(event);
  assertTenantScope(event);
  assertOutcomeMatchesEventCode(eventCode, event.outcome);
  assertDenialMetadata(event);
}

export function resolveAuditResultCode(event: AuditEventInput): KnownErrorCode {
  if (event.outcome === "denied") {
    return event.denial.reasonCode;
  }
  return AUDIT_SUCCESS_RESULT_CODE;
}
