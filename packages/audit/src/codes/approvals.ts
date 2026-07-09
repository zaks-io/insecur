export const APPROVALS_AUDIT_EVENT_CODES = {
  approvalRequestCreated: "approval.request_created",
  approvalRequestApproved: "approval.request_approved",
  approvalRequestRejected: "approval.request_rejected",
  approvalRequestSuperseded: "approval.request_superseded",
  approvalRequestDraftDiscardClosed: "approval.request_draft_discard_closed",
  approvalActionDenied: "approval.action_denied",
} as const;
