import { resolveInstanceId, unwrapRuntimeResult, type BootstrapStatus } from "@insecur/worker-kit";

import type { ApiEnv } from "../env.js";

/**
 * Pre-auth API-side Runtime RPC caller (ADR-0077). Runs before an authenticated actor exists, so it
 * carries no hop token; trust is the private Service Binding boundary. Forwards the bootstrap-status
 * read the edge never performs against the DB itself.
 *
 * Admission resolution and denied-admission audit are the other two pre-auth forwards, but the auth
 * middleware reaches those directly through worker-kit (`createRuntimeAdmittedUserResolver` /
 * `recordAdmissionDeniedAuditForAuthFailure`), so no API-side caller wrapper is needed for them.
 */
export async function getBootstrapStatusViaRuntime(env: ApiEnv): Promise<BootstrapStatus> {
  return unwrapRuntimeResult(
    await env.RUNTIME.getBootstrapStatus({ instanceId: resolveInstanceId(env) }),
  );
}
