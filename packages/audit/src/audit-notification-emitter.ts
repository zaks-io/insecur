import type { AuditEventInput } from "./audit-types.js";

export type AuditNotificationEmitter = (event: AuditEventInput) => Promise<void>;

let auditNotificationEmitter: AuditNotificationEmitter | null = null;

export function setAuditNotificationEmitter(emitter: AuditNotificationEmitter | null): void {
  auditNotificationEmitter = emitter;
}

function logAuditNotificationEmitterFailure(event: AuditEventInput, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown notification emitter failure";
  console.error(
    `[audit-notification-emitter] delivery failed for ${event.eventCode} in ${event.organizationId}: ${message}`,
  );
}

export async function emitAuditNotificationIfConfigured(event: AuditEventInput): Promise<void> {
  if (auditNotificationEmitter === null) {
    return;
  }
  try {
    await auditNotificationEmitter(event);
  } catch (error) {
    logAuditNotificationEmitterFailure(event, error);
  }
}
