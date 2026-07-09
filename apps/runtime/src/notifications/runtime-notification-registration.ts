import {
  registerAuditNotificationEmitter,
  type RegisterAuditNotificationEmitterInput,
} from "@insecur/notifications";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";

let registeredEnv: RuntimeEnv | null = null;

/**
 * Follow-up ticket that wires the concrete tenant-store-backed in-app port + email transport and
 * the end-to-end delivery test. Until then approval-notification DELIVERY is deliberately NOT wired
 * (the adapter, envelope safety, and audit trigger DO ship). Do not read the missing `approval`
 * argument at the call site as "delivery works".
 */
const APPROVAL_DELIVERY_FOLLOWUP_TICKET = "INS-531";

/**
 * Optional alert-only Approval Notification wiring (ADR-0017). Delivery runs in the Runtime deploy
 * (ADR-0077). The concrete in-app persistence and email transport ports are injected via `approval`.
 *
 * When `approval` is omitted, delivery is UNWIRED: approval-request-created audits still emit
 * webhook Event Notifications, but no approver alert is delivered. That absence is surfaced loudly
 * (a one-time warn at registration, and a per-event error in the emitter) so it can never be
 * mistaken for working delivery. See {@link APPROVAL_DELIVERY_FOLLOWUP_TICKET}.
 */
export function ensureAuditNotificationEmitterRegistered(
  env: RuntimeEnv,
  approval?: RegisterAuditNotificationEmitterInput["approval"],
): void {
  if (registeredEnv === env) {
    return;
  }
  if (approval === undefined) {
    console.warn(
      `[approval-notification] approval delivery ports NOT wired — approver alerts will not be ` +
        `delivered until ${APPROVAL_DELIVERY_FOLLOWUP_TICKET}. The metadata-safe adapter, envelope ` +
        `safety, and audit trigger are active; only outbound delivery is unimplemented.`,
    );
  }
  registerAuditNotificationEmitter({
    keyring: createKeyringFromRuntimeEnv(env),
    ...(approval !== undefined ? { approval } : {}),
  });
  registeredEnv = env;
}
