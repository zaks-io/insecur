import type { RuntimeRpcResult } from "@insecur/worker-kit";

import { toRuntimeRpcError } from "./runtime-rpc-error.js";

/**
 * Pre-auth Runtime RPC preamble (ADR-0077). Maps errors exactly like {@link withRuntimeRpcEntry} but
 * performs NO hop-token verification — these methods run before any authenticated actor exists
 * (admission resolution is the step that maps a WorkOS subject to an insecur user id, so no hop token
 * can be minted yet). The DB connection is request-scoped by the caller (`runWithRuntimeConnection`).
 *
 * Trust model: the only trust is the private Service Binding boundary itself. Cloudflare Service
 * Bindings are not publicly routable and this deploy serves zero public routes (deploy-topology
 * conformance), so reaching these methods already requires being the bound API deploy. They touch no
 * keyring and return only identity/metadata (an admitted user id, a metadata-only audit row, or the
 * public bootstrap phase), so no decrypt path is exposed even at the boundary.
 */
export async function withRuntimeRpcUnauthEntry<T>(
  handler: () => Promise<T>,
): Promise<RuntimeRpcResult<T>> {
  try {
    const value = await handler();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: toRuntimeRpcError(error) };
  }
}
