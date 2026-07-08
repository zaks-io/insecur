import { RuntimeService } from "@insecur/runtime/service";
import type { RuntimeRpc } from "@insecur/worker-kit";

/**
 * Compose the API against the real `RuntimeService` in-process (ADR-0065 fast layer). This stands in
 * for the private Service Binding: the API calls `env.RUNTIME.<method>` and the call lands in the
 * actual Runtime implementation against the same Postgres and crypto - no mock of the keyring path,
 * and (after ADR-0077 Option B) no mock of admission/onboarding/operations either. The cloud smoke
 * layer drives the real binding over HTTP separately.
 *
 * Methods are bound to the service instance: `runtimeClientFor` extracts `env.RUNTIME[method]` and
 * invokes it without a receiver, so returning the raw class instance would drop `this` and break
 * private `#post` / `#withConnection` on post-auth RPCs.
 */
export interface FakeRuntimeEnv {
  readonly INSTANCE_ROOT_KEY_V1: { get: () => Promise<string> };
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
}

export function createFakeRuntimeBinding(runtimeEnv: FakeRuntimeEnv): RuntimeRpc {
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined };
  const service = new RuntimeService(ctx as never, runtimeEnv as never);
  return bindRuntimeRpcMethods(service);
}

function bindRuntimeRpcMethods(service: RuntimeService): RuntimeRpc {
  assertRuntimeServiceImplementsRuntimeRpc(service);
  return new Proxy(service, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
}

/** Compile-time drift gate: `RuntimeService` must satisfy the public `RuntimeRpc` contract. */
function assertRuntimeServiceImplementsRuntimeRpc(
  service: RuntimeService,
): asserts service is RuntimeService & RuntimeRpc {
  const contractCheck: RuntimeRpc = service;
  void contractCheck;
}
