import {
  assertMetadataOnlyValue,
  MetadataEnvelopeValidationError,
  type KnownErrorCode,
} from "@insecur/domain";
import {
  AUDIT_SUCCESS_RESULT_CODE,
  DENIED_FIRST_VALUE_AUDIT_EVENT_CODES,
  isFirstValueAuditEventCode,
  SUCCESS_FIRST_VALUE_AUDIT_EVENT_CODES,
  type FirstValueAuditEventCode,
} from "./audit-event-codes.js";
import type { AuditEventInput } from "./audit-types.js";

export class AuditEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditEventValidationError";
  }
}

function assertKnownErrorCode(value: string): asserts value is KnownErrorCode {
  if (value.length === 0 || /\s/.test(value)) {
    throw new AuditEventValidationError("denial reasonCode must be a stable dotted code");
  }
}

function assertOutcomeMatchesEventCode(
  eventCode: FirstValueAuditEventCode,
  outcome: "success" | "denied",
): void {
  if (outcome === "denied" && !DENIED_FIRST_VALUE_AUDIT_EVENT_CODES.has(eventCode)) {
    throw new AuditEventValidationError(
      `eventCode ${eventCode} is not a denied-action audit event name`,
    );
  }
  if (outcome === "success" && !SUCCESS_FIRST_VALUE_AUDIT_EVENT_CODES.has(eventCode)) {
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
  if (!isFirstValueAuditEventCode(eventCode)) {
    throw new AuditEventValidationError(`unknown audit eventCode: ${String(eventCode)}`);
  }

  assertMetadataOnlyAuditEvent(event);
  assertOutcomeMatchesEventCode(eventCode, event.outcome);
  assertDenialMetadata(event);
}

export function resolveAuditResultCode(event: AuditEventInput): KnownErrorCode {
  if (event.outcome === "denied") {
    return event.denial.reasonCode;
  }
  return AUDIT_SUCCESS_RESULT_CODE;
}
