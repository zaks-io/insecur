import type { AuthFailure } from "@insecur/auth";
import type { RequestId } from "@insecur/domain";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { resolveInstanceId, recordAdmissionDeniedViaBinding } from "./admitted-user-resolver.js";

/**
 * Best-effort denied-admission audit for auth middleware and CLI exchange paths.
 *
 * The DB-backed audit body runs in the Runtime deploy (ADR-0077: the edge does zero DB I/O); this
 * forwards over the private Service Binding. Failures are swallowed so the original
 * {@link AuthFailureError} contract is preserved.
 */
export async function recordAdmissionDeniedAuditForAuthFailure(
  env: AuthWorkerEnv,
  failure: AuthFailure,
  requestId: RequestId,
): Promise<void> {
  if (failure.reason !== "not_admitted" || failure.admissionDenial === undefined) {
    return;
  }
  try {
    await recordAdmissionDeniedViaBinding(env.RUNTIME, {
      instanceId: resolveInstanceId(env),
      workosUserId: failure.admissionDenial.workosUserId,
      requestId,
    });
  } catch {
    // Best-effort: preserve the original AuthFailureError response contract.
  }
}
