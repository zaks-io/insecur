import { ABUSE_ERROR_CODES, type RequestId, type UserId } from "@insecur/domain";
import { resolveInstanceId } from "../auth/admitted-user-resolver.js";
import type { AuthWorkerEnv } from "../auth/auth-worker-env.js";
import { unwrapRuntimeResult } from "../rpc/unwrap-runtime-result.js";
import type { RuntimeRpc } from "../rpc/runtime-rpc-contract.js";
import { DENIED_AUDIT_EVENT_BY_PUBLIC_EDGE_TARGET } from "./denied-audit-by-target.js";
import type { PublicEdgeAbuseTarget } from "./public-edge-abuse-target.js";

export type AbuseDeniedRuntimeRpc = Pick<RuntimeRpc, "recordAbuseDenied">;

/**
 * Best-effort denied audit for public-edge rate limiting. The audit body runs in the Runtime
 * deploy (ADR-0077); failures are swallowed so the original 429 response is preserved.
 */
export async function recordAbuseDeniedAudit(
  env: AuthWorkerEnv & { readonly RUNTIME: AbuseDeniedRuntimeRpc },
  input: {
    target: PublicEdgeAbuseTarget;
    requestId: RequestId;
    actorUserId?: UserId;
  },
): Promise<void> {
  try {
    unwrapRuntimeResult(
      await env.RUNTIME.recordAbuseDenied({
        instanceId: resolveInstanceId(env),
        requestId: input.requestId,
        eventCode: DENIED_AUDIT_EVENT_BY_PUBLIC_EDGE_TARGET[input.target],
        reasonCode: ABUSE_ERROR_CODES.rateLimited,
        ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      }),
    );
  } catch {
    // Best-effort: preserve the rate-limit response contract.
  }
}
