import type { AuditEventInput } from "./audit-types.js";

export type AuditNotificationEmitter = (event: AuditEventInput) => Promise<void>;

let auditNotificationEmitter: AuditNotificationEmitter | null = null;

export function setAuditNotificationEmitter(emitter: AuditNotificationEmitter | null): void {
  auditNotificationEmitter = emitter;
}

export async function emitAuditNotificationIfConfigured(event: AuditEventInput): Promise<void> {
  if (auditNotificationEmitter === null) {
    return;
  }
  await auditNotificationEmitter(event);
}
