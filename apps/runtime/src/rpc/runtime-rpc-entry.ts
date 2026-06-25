import type { ActorRef } from "@insecur/access";
import type { UserActor } from "@insecur/auth";
import { toAccessActor, toAuditActor } from "@insecur/worker-kit";
import type { RuntimeRpcResult } from "@insecur/worker-kit";

import type { RuntimeEnv } from "../env.js";
import { actorFromHopToken } from "./actor-from-token.js";
import { toRuntimeRpcError } from "./runtime-rpc-error.js";

/** Verified hop-token actor plus the audit/access views every RPC method needs. */
export interface RuntimeRpcActorContext {
  readonly actor: UserActor;
  readonly auditActor: ReturnType<typeof toAuditActor>;
  readonly accessActor: ActorRef;
}

export interface RuntimeRpcEntryOptions {
  readonly env: RuntimeEnv;
  readonly actorToken: string;
  readonly configureDb: () => void;
}

/**
 * Shared Runtime RPC preamble and error envelope (ADR-0034 / ADR-0077). Configures the DB
 * connection, verifies the scoped hop token, derives audit/access actors, then runs the method
 * body. Failures map through `toRuntimeRpcError` so `code`/`retryable` survive the binding.
 */
export async function withRuntimeRpcEntry<T>(
  options: RuntimeRpcEntryOptions,
  handler: (actors: RuntimeRpcActorContext) => Promise<T>,
): Promise<RuntimeRpcResult<T>> {
  try {
    options.configureDb();
    const actor = await actorFromHopToken(options.env, options.actorToken);
    const actors: RuntimeRpcActorContext = {
      actor,
      auditActor: toAuditActor(actor),
      accessActor: toAccessActor(actor),
    };
    const value = await handler(actors);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: toRuntimeRpcError(error) };
  }
}
