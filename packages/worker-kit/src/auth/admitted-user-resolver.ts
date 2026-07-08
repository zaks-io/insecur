import type { AdmittedUserCliSessionRevoked, AdmittedUserResolver } from "@insecur/auth";
import type { RequestId, UserId } from "@insecur/domain";
import type { AuthWorkerEnv, RuntimeAdmissionRpc } from "./auth-worker-env.js";
import type { ResolveAdmissionRpcInput } from "../rpc/runtime-rpc-contract.js";
import { unwrapRuntimeResult } from "../rpc/unwrap-runtime-result.js";

export function resolveInstanceId(env: AuthWorkerEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

export type ResolveAdmissionViaBindingResult = UserId | null | AdmittedUserCliSessionRevoked;

/**
 * Resolve a WorkOS subject to its admitted insecur user id over the private Runtime Service Binding
 * (ADR-0077). When `sessionId` is set, the Runtime also checks CLI session revocation in the same
 * pre-auth RPC (INS-472).
 */
export async function resolveAdmissionViaBinding(
  runtime: RuntimeAdmissionRpc,
  input: ResolveAdmissionRpcInput,
): Promise<ResolveAdmissionViaBindingResult> {
  const payload = unwrapRuntimeResult(await runtime.resolveAdmission(input));
  if (payload.cliSessionRevoked) {
    return "cli_session_revoked";
  }
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
  return (workosUserId, context) =>
    resolveAdmissionViaBinding(env.RUNTIME, {
      instanceId,
      workosUserId,
      ...(context === undefined ? {} : { sessionId: context.sessionId }),
    });
}
