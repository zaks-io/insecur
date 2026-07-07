import {
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  mintScopedAccessToken,
  type UserActor,
} from "@insecur/auth";

import { buildAuthenticatedRuntimeClientMethods } from "./runtime-client-method-map.js";
import type {
  AuthenticatedRuntimeClient,
  ClientMethod,
  PostAuthMethodName,
} from "./runtime-client-types.js";
import type { RuntimeRpc, RuntimeRpcResult } from "./runtime-rpc-contract.js";
import { validateRuntimeTokenSigningSecret } from "./runtime-token-signing-secret.js";
import { unwrapRuntimeResult } from "./unwrap-runtime-result.js";

/**
 * The binding fields the authenticated Runtime client needs (ADR-0077): the private Service Binding
 * to the Runtime Worker and the HMAC secret it mints the scoped hop token with. `ApiEnv` satisfies
 * this; the client reads nothing else off the env.
 */
export interface RuntimeClientEnv {
  readonly RUNTIME: RuntimeRpc;
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
}

export type { AuthenticatedRuntimeClient } from "./runtime-client-types.js";

/** Mint-once hop token, call the named binding method, unwrap into the API error seam. */
function createRuntimeForward(
  env: RuntimeClientEnv,
  actorToken: () => Promise<string>,
): <K extends PostAuthMethodName>(method: K) => ClientMethod<K> {
  return function forward<K extends PostAuthMethodName>(method: K): ClientMethod<K> {
    const rpc = env.RUNTIME[method] as unknown as (
      input: Record<string, unknown>,
    ) => Promise<RuntimeRpcResult<unknown>>;
    return (async (input: Record<string, unknown>) =>
      unwrapRuntimeResult(
        await rpc({ ...input, actorToken: await actorToken() }),
      )) as ClientMethod<K>;
  };
}

/**
 * The single API-side Runtime RPC seam (ADR-0077). The public edge does zero DB I/O: a route parses
 * HTTP, then forwards the non-keyring DB work through this client. We mint one scoped, audience-bound
 * hop token from the already-verified actor (lazily, shared across calls on this client), call the
 * Runtime over the private binding, and unwrap the result into the API error seam. The Runtime
 * rebuilds the actor from the token — the API never sends an actor object across the seam.
 *
 * This replaces the per-method `*ViaRuntime` pass-throughs: mint+call+unwrap lives here once, so a
 * new forwarded post-auth operation needs no new caller, only its method below and the contract.
 */
export function runtimeClientFor(
  env: RuntimeClientEnv,
  actor: UserActor,
): AuthenticatedRuntimeClient {
  validateRuntimeTokenSigningSecret(env.RUNTIME_TOKEN_SIGNING_SECRET);

  let tokenPromise: Promise<string> | undefined;
  const actorToken = (): Promise<string> =>
    (tokenPromise ??= mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: env.RUNTIME_TOKEN_SIGNING_SECRET,
    }).then((minted) => minted.token));

  const forward = createRuntimeForward(env, actorToken);

  return buildAuthenticatedRuntimeClientMethods(forward);
}
