export const PROTECTED_CHANGE_AUDIT_EVENT_CODES = {
  protectedChangeRequestCreated: "protected_change.request_created",
  protectedChangeSubmitted: "protected_change.submitted",
  protectedChangeApproved: "protected_change.approved",
  protectedChangeRejected: "protected_change.rejected",
  protectedChangeCanceled: "protected_change.canceled",
  protectedChangeStaleClosed: "protected_change.stale_closed",
  protectedChangeExecutionStarted: "protected_change.execution_started",
  protectedChangeExecutionSucceeded: "protected_change.execution_succeeded",
  protectedChangeExecutionFailed: "protected_change.execution_failed",
  protectedChangeTransitionDenied: "protected_change.transition_denied",
} as const;
