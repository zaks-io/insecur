import { PRODUCTION_AUDIT_EVENT_CODES, type AuditEventCode } from "@insecur/audit";

export type ProtectedChangeAuditAction =
  | "request_created"
  | "submitted"
  | "approved"
  | "rejected"
  | "canceled"
  | "stale_closed"
  | "execution_started"
  | "execution_succeeded"
  | "execution_failed"
  | "transition_denied";

const SUCCESS_PROTECTED_CHANGE_AUDIT_EVENT_CODE: Record<
  Exclude<ProtectedChangeAuditAction, "transition_denied">,
  AuditEventCode
> = {
  request_created: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeRequestCreated,
  submitted: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeSubmitted,
  approved: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeApproved,
  rejected: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeRejected,
  canceled: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeCanceled,
  stale_closed: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeStaleClosed,
  execution_started: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeExecutionStarted,
  execution_succeeded: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeExecutionSucceeded,
  execution_failed: PRODUCTION_AUDIT_EVENT_CODES.protectedChangeExecutionFailed,
};

export function protectedChangeAuditEventCode(input: {
  readonly action: ProtectedChangeAuditAction;
  readonly outcome: "success" | "denied";
}): AuditEventCode {
  if (input.outcome === "denied" || input.action === "transition_denied") {
    return PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied;
  }
  return SUCCESS_PROTECTED_CHANGE_AUDIT_EVENT_CODE[input.action];
}
