import type { AdmittedUserResolver } from "@insecur/auth";
import type { RequestId, UserId } from "@insecur/domain";
import type { AuthWorkerEnv, RuntimeAdmissionRpc } from "./auth-worker-env.js";
import { unwrapRuntimeResult } from "../rpc/unwrap-runtime-result.js";

export function resolveInstanceId(env: AuthWorkerEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

/**
 * Resolve a WorkOS subject to its admitted insecur user id over the private Runtime Service Binding
 * (ADR-0077). Admission resolution is DB I/O; the public edge performs none and forwards it here.
 */
export async function resolveAdmissionViaBinding(
  runtime: RuntimeAdmissionRpc,
  input: { instanceId: string; workosUserId: string },
): Promise<UserId | null> {
  const payload = unwrapRuntimeResult(await runtime.resolveAdmission(input));
  return payload.userId;
}

/** Forward the best-effort denied-admission audit to the Runtime; never throws. */
export async function recordAdmissionDeniedViaBinding(
  runtime: RuntimeAdmissionRpc,
  input: { instanceId: string; workosUserId: string; requestId: RequestId },
): Promise<void> {
  unwrapRuntimeResult(await runtime.recordAdmissionDenied(input));
}

/** The production resolver: edge-side glue that reaches the persisted store over the binding. */
export function createRuntimeAdmittedUserResolver(env: AuthWorkerEnv): AdmittedUserResolver {
  const instanceId = resolveInstanceId(env);
  return (workosUserId: string) =>
    resolveAdmissionViaBinding(env.RUNTIME, { instanceId, workosUserId });
}
