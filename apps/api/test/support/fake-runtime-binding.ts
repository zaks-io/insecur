import { RuntimeService } from "@insecur/runtime/service";
import type { RuntimeRpc } from "@insecur/worker-kit";

/**
 * Compose the API against the real `RuntimeService` in-process (ADR-0065 fast layer). This stands in
 * for the private Service Binding: the API calls `env.RUNTIME.<method>` and the call lands in the
 * actual Runtime implementation against the same Postgres and crypto - no mock of the keyring path,
 * and (after ADR-0077 Option B) no mock of admission/onboarding/operations either. The cloud smoke
 * layer drives the real binding over HTTP separately.
 */
export interface FakeRuntimeEnv {
  readonly INSTANCE_ROOT_KEY_V1: { get: () => Promise<string> };
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
  readonly [key: string]: unknown;
}

export function createFakeRuntimeBinding(runtimeEnv: FakeRuntimeEnv): RuntimeRpc {
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined };
  const service = new RuntimeService(ctx as never, runtimeEnv as never);
  return new Proxy(service as RuntimeRpc, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
}

/**
 * Override selected RPC methods on an in-process binding. Object spread cannot be used here: the
 * binding is a Proxy over class-prototype methods, so `{ ...binding, consumeGrant }` drops every
 * other Runtime RPC entrypoint (writeSecret, resolveAdmission, and the metadata reads).
 */
export function wrapRuntimeRpcBinding<T extends RuntimeRpc>(binding: T, overrides: Partial<T>): T {
  return new Proxy(binding, {
    get(target, property, receiver) {
      const override = overrides[property as keyof T];
      if (override !== undefined) {
        return override;
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
}
