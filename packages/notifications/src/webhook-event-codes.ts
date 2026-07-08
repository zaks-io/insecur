import { FIRST_VALUE_AUDIT_EVENT_CODES, PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";

/** Stable webhook event codes subscribers may select (INS-453). */
export const WEBHOOK_EVENT_CODES = {
  secretNonProtectedWrite: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
  secretProtectedDraftWrite: PRODUCTION_AUDIT_EVENT_CODES.secretProtectedDraftWrite,
  injectionGrantIssued: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
  injectionGrantConsumed: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
  syncExecutionCompleted: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted,
  approvalRequestCreated: PRODUCTION_AUDIT_EVENT_CODES.approvalRequestCreated,
  approvalRequestApproved: PRODUCTION_AUDIT_EVENT_CODES.approvalRequestApproved,
  approvalRequestRejected: PRODUCTION_AUDIT_EVENT_CODES.approvalRequestRejected,
  connectionCreated: PRODUCTION_AUDIT_EVENT_CODES.connectionCreated,
  connectionValidated: PRODUCTION_AUDIT_EVENT_CODES.connectionValidated,
} as const;

export type WebhookEventCode = (typeof WEBHOOK_EVENT_CODES)[keyof typeof WEBHOOK_EVENT_CODES];

const WEBHOOK_EVENT_CODE_SET = new Set<string>(Object.values(WEBHOOK_EVENT_CODES));

export function isWebhookEventCode(value: string): value is WebhookEventCode {
  return WEBHOOK_EVENT_CODE_SET.has(value);
}

export function listWebhookEventCodes(): readonly WebhookEventCode[] {
  return Object.values(WEBHOOK_EVENT_CODES);
}
