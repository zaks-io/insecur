import { userId, type RequestId, type UserId } from "@insecur/domain";
import type { RuntimeAdmissionRpc } from "../auth-worker-env.js";

interface DeniedCall {
  instanceId: string;
  workosUserId: string;
  requestId: RequestId;
}

export interface FakeAdmissionRuntime extends RuntimeAdmissionRpc {
  readonly deniedCalls: DeniedCall[];
}

/**
 * In-memory stand-in for the pre-auth admission seam (ADR-0077). Production resolves admission over
 * the private Service Binding; unit tests inject this fake to exercise the RUNTIME-backed resolver
 * without a real binding or DB.
 */
export function createFakeAdmissionRuntime(
  admissions: Readonly<Record<string, UserId>> = {},
  options: { readonly revokedSessionIds?: ReadonlySet<string> } = {},
): FakeAdmissionRuntime {
  const admitted = new Map(Object.entries(admissions));
  const revokedSessionIds = options.revokedSessionIds ?? new Set<string>();
  const deniedCalls: FakeAdmissionRuntime["deniedCalls"] = [];
  return {
    deniedCalls,
    resolveAdmission: (input) =>
      Promise.resolve({
        ok: true,
        value: { userId: admitted.get(input.workosUserId) ?? null },
      }),
    isCliSessionRevoked: (input) =>
      Promise.resolve({
        ok: true,
        value: { revoked: revokedSessionIds.has(input.sessionId) },
      }),
    recordAdmissionDenied: (input) => {
      deniedCalls.push({
        instanceId: input.instanceId,
        workosUserId: input.workosUserId,
        requestId: input.requestId,
      });
      return Promise.resolve({ ok: true, value: { recorded: true } });
    },
  };
}

/** A branded user id convenient for fixtures. */
export function fakeAdmittedUserId(raw = "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"): UserId {
  return userId.brand(raw);
}
