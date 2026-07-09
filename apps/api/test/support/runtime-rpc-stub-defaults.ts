import { userId } from "@insecur/domain";
import type { RuntimeRpc, RuntimeRpcResult } from "@insecur/worker-kit";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "./setup-unit-auth.js";

function ok<T>(value: T): RuntimeRpcResult<T> {
  return { ok: true, value };
}

const defaultResolveSessionWhoami = ok({
  sessionValid: true as const,
  sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  resolvedContext: {},
  attribution: { tier: "none" as const },
});

/**
 * Optional default implementations for RPC methods that many route tests rely on without
 * per-test overrides. New RPC delegates get `vi.fn()` automatically via the stub Proxy;
 * add an entry here only when a method needs a shared canned default.
 */
export const RUNTIME_RPC_STUB_DEFAULTS: Partial<{
  [K in keyof RuntimeRpc]: RuntimeRpc[K];
}> = {
  resolveAdmission: (input) =>
    Promise.resolve(
      ok({
        userId: input.workosUserId === WORKOS_USER_ID ? userId.brand(ADMITTED_USER_ID_RAW) : null,
        cliSessionRevoked: false,
      }),
    ),
  recordAdmissionDenied: () => Promise.resolve(ok({ recorded: true as const })),
  recordAbuseDenied: () => Promise.resolve(ok({ recorded: true as const })),
  recordDeviceAuthorizationAudit: () => Promise.resolve(ok({ recorded: true as const })),
  revokeCliSession: () => Promise.resolve(ok({ revoked: true })),
  resolveSessionWhoami: () => Promise.resolve(defaultResolveSessionWhoami),
};
