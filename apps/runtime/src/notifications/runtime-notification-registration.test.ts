import { describe, expect, it, vi } from "vitest";

vi.mock("@insecur/notifications", () => ({
  registerAuditNotificationEmitter: vi.fn(),
}));

vi.mock("../crypto/keyring-context.js", () => ({
  createKeyringFromRuntimeEnv: vi.fn(() => ({ kind: "test-keyring" })),
}));

import { registerAuditNotificationEmitter } from "@insecur/notifications";
import { ensureAuditNotificationEmitterRegistered } from "./runtime-notification-registration.js";

describe("ensureAuditNotificationEmitterRegistered", () => {
  it("registers once per env instance", () => {
    const env = { INSTANCE_ROOT_KEY_V1: "00".repeat(32) } as never;

    ensureAuditNotificationEmitterRegistered(env);
    ensureAuditNotificationEmitterRegistered(env);

    expect(registerAuditNotificationEmitter).toHaveBeenCalledTimes(1);
    expect(registerAuditNotificationEmitter).toHaveBeenCalledWith({
      keyring: { kind: "test-keyring" },
    });
  });
});
