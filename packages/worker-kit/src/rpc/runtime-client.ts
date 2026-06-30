import {
  INSECUR_RUNTIME_TOKEN_AUDIENCE,
  mintScopedAccessToken,
  type UserActor,
} from "@insecur/auth";

import type { RuntimeRpc, RuntimeRpcResult } from "./runtime-rpc-contract.js";
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

/** The post-auth RPC methods: every `RuntimeRpc` method whose input carries an `actorToken`. */
type PostAuthMethodName = {
  [K in keyof RuntimeRpc]: Parameters<RuntimeRpc[K]>[0] extends { readonly actorToken: string }
    ? K
    : never;
}[keyof RuntimeRpc];

/** A post-auth method as the client exposes it: `actorToken` removed, the RPC result unwrapped. */
type ClientMethod<K extends PostAuthMethodName> = (
  input: Omit<Parameters<RuntimeRpc[K]>[0], "actorToken">,
) => Promise<Awaited<ReturnType<RuntimeRpc[K]>> extends { value: infer V } ? V : never>;

/**
 * An authenticated view of the Runtime over the private binding. Each method is its `RuntimeRpc`
 * counterpart with the `actorToken` removed (the client supplies it) and the `RuntimeRpcResult`
 * unwrapped to the payload (the client throws the shaped error on failure). Routes call it like the
 * Runtime directly: `await runtimeClientFor(env, actor).createInvitation({ ... })`.
 */
export type AuthenticatedRuntimeClient = {
  [K in PostAuthMethodName]: ClientMethod<K>;
};

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
  let tokenPromise: Promise<string> | undefined;
  const actorToken = (): Promise<string> =>
    (tokenPromise ??= mintScopedAccessToken({
      actor,
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: env.RUNTIME_TOKEN_SIGNING_SECRET,
    }).then((minted) => minted.token));

  /**
   * Mint-once, call the named binding method with the hop token, unwrap into the API error seam.
   * The binding method is widened to one concrete call signature for the dispatch: an indexed access
   * over the union of `RuntimeRpc` methods otherwise collapses to an unusable parameter intersection.
   * The precise per-method types are preserved at the call site by the {@link ClientMethod} return.
   */
  function forward<K extends PostAuthMethodName>(method: K): ClientMethod<K> {
    const rpc = env.RUNTIME[method] as unknown as (
      input: Record<string, unknown>,
    ) => Promise<RuntimeRpcResult<unknown>>;
    return (async (input: Record<string, unknown>) =>
      unwrapRuntimeResult(
        await rpc({ ...input, actorToken: await actorToken() }),
      )) as ClientMethod<K>;
  }

  return {
    provisionGuidedOrganization: forward("provisionGuidedOrganization"),
    createOperatorOrganization: forward("createOperatorOrganization"),
    createInvitation: forward("createInvitation"),
    acceptInvitation: forward("acceptInvitation"),
    getOperation: forward("getOperation"),
    issueInjectionGrant: forward("issueInjectionGrant"),
    completeBootstrapOperatorClaim: forward("completeBootstrapOperatorClaim"),
    writeSecret: forward("writeSecret"),
    consumeGrant: forward("consumeGrant"),
  };
}
