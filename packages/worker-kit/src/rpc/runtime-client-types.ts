import type { RuntimeRpc } from "./runtime-rpc-contract.js";

/** The post-auth RPC methods: every `RuntimeRpc` method whose input carries an `actorToken`. */
export type PostAuthMethodName = {
  [K in keyof RuntimeRpc]: Parameters<RuntimeRpc[K]>[0] extends { readonly actorToken: string }
    ? K
    : never;
}[keyof RuntimeRpc];

/**
 * The payload behind a `RuntimeRpcResult`. Distributes over the result union so the `ok: false`
 * branch (which carries no `value`) drops to `never` and only the success payload survives — a
 * non-distributing `extends { value: infer V }` over the whole union otherwise resolves to `never`.
 */
type UnwrapValue<R> = R extends { readonly ok: true; readonly value: infer V } ? V : never;

/** A post-auth method as the client exposes it: `actorToken` removed, the RPC result unwrapped. */
export type ClientMethod<K extends PostAuthMethodName> = (
  input: Omit<Parameters<RuntimeRpc[K]>[0], "actorToken">,
) => Promise<UnwrapValue<Awaited<ReturnType<RuntimeRpc[K]>>>>;

/**
 * An authenticated view of the Runtime over the private binding. Each method is its `RuntimeRpc`
 * counterpart with the `actorToken` removed (the client supplies it) and the `RuntimeRpcResult`
 * unwrapped to the payload (the client throws the shaped error on failure). Routes call it like the
 * Runtime directly: `await runtimeClientFor(env, actor).createInvitation({ ... })`.
 */
export type AuthenticatedRuntimeClient = {
  [K in PostAuthMethodName]: ClientMethod<K>;
};
