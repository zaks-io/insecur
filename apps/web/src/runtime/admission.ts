import type { AdmittedUserResolver, AuthFailure } from "@insecur/auth";
import type { RequestId, UserId } from "@insecur/domain";
import type { WebEnv } from "../env.js";
import type { RuntimeAdmissionRpc, RuntimeRpcResult } from "./admission-types.js";

function unwrapRuntimeResult<T>(result: RuntimeRpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function resolveInstanceId(env: WebEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

async function resolveAdmissionViaBinding(
  runtime: RuntimeAdmissionRpc,
  input: { instanceId: string; workosUserId: string },
): Promise<UserId | null> {
  const payload = unwrapRuntimeResult(await runtime.resolveAdmission(input));
  return payload.userId;
}

async function recordAdmissionDeniedViaBinding(
  runtime: RuntimeAdmissionRpc,
  input: { instanceId: string; workosUserId: string; requestId: RequestId },
): Promise<void> {
  unwrapRuntimeResult(await runtime.recordAdmissionDenied(input));
}

/**
 * Best-effort denied-admission audit for the web BFF auth path. The DB-backed audit body runs in
 * the Runtime deploy (ADR-0077); this forwards over the private Service Binding and swallows
 * failures so the original auth failure contract is preserved.
 */
export async function recordAdmissionDeniedAuditForAuthFailure(
  env: WebEnv,
  failure: AuthFailure,
  reqId: RequestId,
): Promise<void> {
  if (failure.reason !== "not_admitted" || failure.admissionDenial === undefined) {
    return;
  }
  try {
    await recordAdmissionDeniedViaBinding(env.RUNTIME, {
      instanceId: resolveInstanceId(env),
      workosUserId: failure.admissionDenial.workosUserId,
      requestId: reqId,
    });
  } catch {
    // Best-effort: preserve the original auth failure response contract.
  }
}

export function createRuntimeAdmittedUserResolver(env: WebEnv): AdmittedUserResolver {
  const instanceId = resolveInstanceId(env);
  return (workosUserId: string) =>
    resolveAdmissionViaBinding(env.RUNTIME, { instanceId, workosUserId });
}
