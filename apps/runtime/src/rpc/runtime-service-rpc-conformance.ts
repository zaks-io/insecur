import type { RuntimeRpc } from "@insecur/worker-kit";
import type { WorkerEntrypoint } from "cloudflare:workers";

import type { RuntimeEnv } from "../env.js";
import type { RuntimeServiceBase } from "../runtime-service.js";
import { RUNTIME_POST_AUTH_RPC } from "./runtime-service-delegated-post-auth-rpc-host.js";
import { RuntimeServiceDelegatedPostAuthRpc } from "./runtime-service-delegated-post-auth-rpc.js";

/**
 * Compile-time conformance that the private `RuntimeService` WorkerEntrypoint exposes every method
 * `RuntimeRpc` promises the API Worker (INS-512). This is the only place the two halves of the
 * method set are typed back together, so it is the only place drift between them is checkable:
 *
 * - `RuntimeServiceBase` carries the class-declared methods (keyring-bound + pre-auth) directly.
 * - `RuntimeServiceDelegatedPostAuthRpc` carries the `Object.assign`-mixed-in post-auth methods.
 *   `Object.assign(RuntimeServiceBase.prototype, RuntimeServiceDelegatedPostAuthRpc)` in
 *   `runtime-service.ts` is a runtime-only merge; TypeScript never sees the result as one type, so
 *   without this file nothing checks the mixed-in half against `RuntimeRpc` at all.
 *
 * `OmitThisParameter` strips each delegate's `this: RuntimePostAuthRpcHost` parameter so the merged
 * shape matches the zero-`this`, single-input signatures `RuntimeRpc` declares (the shape the API
 * Worker actually calls over the Service Binding).
 *
 * If a method is added to `RuntimeRpc` but not exposed by `RuntimeService` (either half), or an
 * existing delegated method is renamed or dropped, `ExposesRuntimeRpc<MergedRuntimeServiceInstance>`
 * resolves to `false`, which no longer assigns to the `const true` binding below and `tsc` fails —
 * before the drift ever reaches a deploy. `runtime-service-rpc-conformance.test.ts` exercises the
 * failure mode with a deliberately incomplete stand-in type, since a real regression can only be
 * simulated, not built.
 *
 * Scope note (ADR-0077): this file only compares method *shapes*. It imports zero root-key or
 * decrypt surface and adds no runtime behavior — `RuntimeRpc` itself is already the narrow, DB/keyring
 * -free contract the API Worker binds against, and this module changes nothing about what crosses
 * the Service Binding.
 *
 * Guarantee boundary: `T extends RuntimeRpc` catches a `RuntimeRpc` method being missing, renamed,
 * or returning an incompatible type. The exact-surface assertion below also rejects extra public
 * methods. The delegated post-auth seam is a symbol-named instance property, which Cloudflare RPC
 * does not expose as a prototype method.
 * Because TypeScript checks method-shorthand
 * parameters bivariantly, it does
 * NOT catch a delegate narrowing its input to require MORE fields than `RuntimeRpc` promises to
 * supply. Neither gap has a real instance in this codebase today; this file guards against
 * method-level drift (the failure mode the ticket targets), not full input/output variance.
 */
type DelegatedPostAuthMethods = {
  [K in keyof typeof RuntimeServiceDelegatedPostAuthRpc]: OmitThisParameter<
    (typeof RuntimeServiceDelegatedPostAuthRpc)[K]
  >;
};

/** The full RPC-callable surface `RuntimeService` exposes once the post-auth mixin is applied. */
export type MergedRuntimeServiceInstance = InstanceType<typeof RuntimeServiceBase> &
  DelegatedPostAuthMethods;

/**
 * `true` when `T` carries every `RuntimeRpc` member with a compatible signature, `false` otherwise.
 * Exported so the regression test can instantiate it directly with a deliberately incomplete surface
 * and assert the `false` branch, proving the drift path this file exists to catch actually resolves.
 */
export type ExposesRuntimeRpc<T> = T extends RuntimeRpc ? true : false;

/** Rejects accidental public WorkerEntrypoint methods outside the reviewed Runtime RPC contract. */
export type HasOnlyRuntimeRpcMethods<T> =
  Exclude<
    keyof T,
    keyof RuntimeRpc | keyof WorkerEntrypoint<RuntimeEnv> | typeof RUNTIME_POST_AUTH_RPC
  > extends never
    ? true
    : false;

// The conformance assertion itself: assigning a non-`true` value to a `const: true` binding is a
// type error, so this line fails to typecheck the moment `RuntimeService`'s merged instance type
// stops exposing every `RuntimeRpc` member.
export const runtimeServiceExposesRuntimeRpc: ExposesRuntimeRpc<MergedRuntimeServiceInstance> = true;
export const runtimeServiceHasOnlyRuntimeRpcMethods: HasOnlyRuntimeRpcMethods<MergedRuntimeServiceInstance> = true;
