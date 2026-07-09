import { isAuthorizationScope, type ActorRef } from "@insecur/access";
import type { RuntimeHopActor, UserActor } from "@insecur/auth";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { toAccessActor, toAuditActor } from "@insecur/worker-kit";
import type { RuntimeRpcResult } from "@insecur/worker-kit";

import type { RuntimeEnv } from "../env.js";
import { actorFromHopToken } from "./actor-from-token.js";
import { RuntimeActorTokenError, toRuntimeRpcError } from "./runtime-rpc-error.js";
import { captureRuntimeRpcError } from "./runtime-rpc-sentry.js";

/** Verified hop-token actor plus the audit/access views every RPC method needs. */
export interface RuntimeRpcActorContext {
  /** Lazily rejects machine callers when a user-only RPC delegate reads this property. */
  readonly actor: UserActor;
  readonly auditActor: ReturnType<typeof toAuditActor>;
  readonly accessActor: ActorRef;
}

export interface RuntimeRpcEntryOptions {
  readonly env: RuntimeEnv;
  readonly actorToken: string;
}

function accessActorFromHopActor(actor: RuntimeHopActor): ActorRef {
  if (actor.type !== "machine") {
    return toAccessActor(actor);
  }
  return {
    ...actor,
    credentialScopes: actor.credentialScopes.filter(isAuthorizationScope),
  };
}

function auditActorFromHopActor(actor: RuntimeHopActor) {
  return actor.type === "machine"
    ? { type: "machine" as const, machineIdentityId: actor.machineIdentityId }
    : toAuditActor(actor);
}

function userActorForContext(actor: RuntimeHopActor): UserActor {
  if (actor.type === "machine") {
    throw new RuntimeActorTokenError(AUTH_ERROR_CODES.invalid, "user actor required");
  }
  return actor;
}

/**
 * Shared Runtime RPC preamble and error envelope (ADR-0034 / ADR-0077). Verifies the scoped hop
 * token, derives audit/access actors, then runs the method body. Failures map through
 * `toRuntimeRpcError` so `code`/`retryable` survive the binding.
 *
 * The DB connection is request-scoped by the caller (`runWithRuntimeConnection`): a cached
 * `postgres.js` client's socket promises are pinned to the request context that created them, so a
 * client shared across RPC invocations cancels its continuations ("promise resolved from a different
 * request context"). Per-request connection scope keeps every query in its own context.
 */
export async function withRuntimeRpcEntry<T>(
  options: RuntimeRpcEntryOptions,
  handler: (actors: RuntimeRpcActorContext) => Promise<T>,
): Promise<RuntimeRpcResult<T>> {
  try {
    const actor = await actorFromHopToken(options.env, options.actorToken);
    const actors: RuntimeRpcActorContext = {
      get actor() {
        return userActorForContext(actor);
      },
      auditActor: auditActorFromHopActor(actor),
      accessActor: accessActorFromHopActor(actor),
    };
    const value = await handler(actors);
    return { ok: true, value };
  } catch (error) {
    const rpcError = toRuntimeRpcError(error);
    captureRuntimeRpcError(rpcError);
    return { ok: false, error: rpcError };
  }
}
