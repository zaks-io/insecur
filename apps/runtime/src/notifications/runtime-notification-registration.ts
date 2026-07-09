import {
  registerAuditNotificationEmitter,
  type RegisterAuditNotificationEmitterInput,
} from "@insecur/notifications";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";

let registeredEnv: RuntimeEnv | null = null;

/**
 * Optional alert-only Approval Notification wiring (ADR-0017). Delivery runs in the Runtime deploy
 * (ADR-0077). The concrete in-app persistence and email transport ports are injected here; when
 * absent, approval-request-created audits still emit webhook Event Notifications but no approver
 * alert fires. Keeping this an injected seam avoids fabricating a no-op delivery adapter.
 */
export function ensureAuditNotificationEmitterRegistered(
  env: RuntimeEnv,
  approval?: RegisterAuditNotificationEmitterInput["approval"],
): void {
  if (registeredEnv === env) {
    return;
  }
  registerAuditNotificationEmitter({
    keyring: createKeyringFromRuntimeEnv(env),
    ...(approval !== undefined ? { approval } : {}),
  });
  registeredEnv = env;
}
