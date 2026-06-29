import type { RequestId, UserId } from "@insecur/domain";
import {
  recordAdmissionDeniedViaBinding,
  resolveAdmissionViaBinding,
  resolveInstanceId,
  unwrapRuntimeResult,
  type BootstrapStatus,
} from "@insecur/worker-kit";

import type { ApiEnv } from "../env.js";

/**
 * Pre-auth API-side Runtime RPC callers (ADR-0077). These run before an authenticated actor exists,
 * so they carry no hop token; trust is the private Service Binding boundary. They forward the DB I/O
 * the edge never performs (admission resolution, denied-admission audit, bootstrap status).
 */

export function resolveAdmissionViaRuntime(
  env: ApiEnv,
  input: { workosUserId: string },
): Promise<UserId | null> {
  return resolveAdmissionViaBinding(env.RUNTIME, {
    instanceId: resolveInstanceId(env),
    workosUserId: input.workosUserId,
  });
}

export function recordAdmissionDeniedViaRuntime(
  env: ApiEnv,
  input: { workosUserId: string; requestId: RequestId },
): Promise<void> {
  return recordAdmissionDeniedViaBinding(env.RUNTIME, {
    instanceId: resolveInstanceId(env),
    workosUserId: input.workosUserId,
    requestId: input.requestId,
  });
}

export async function getBootstrapStatusViaRuntime(env: ApiEnv): Promise<BootstrapStatus> {
  return unwrapRuntimeResult(
    await env.RUNTIME.getBootstrapStatus({ instanceId: resolveInstanceId(env) }),
  );
}
