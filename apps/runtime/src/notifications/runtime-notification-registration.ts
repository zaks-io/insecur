import { registerAuditNotificationEmitter } from "@insecur/notifications";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";

let registeredEnv: RuntimeEnv | null = null;

export function ensureAuditNotificationEmitterRegistered(env: RuntimeEnv): void {
  if (registeredEnv === env) {
    return;
  }
  registerAuditNotificationEmitter({
    keyring: createKeyringFromRuntimeEnv(env),
  });
  registeredEnv = env;
}
