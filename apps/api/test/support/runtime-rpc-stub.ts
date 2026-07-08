import type { RuntimeRpc } from "@insecur/worker-kit";
import { vi, type MockedFunction } from "vitest";
import { RUNTIME_RPC_STUB_DEFAULTS } from "./runtime-rpc-stub-defaults.js";

/**
 * A full `RuntimeRpc` stub for API route unit tests (ADR-0077 Option B). Every keyring-bound and
 * non-keyring DB operation now crosses the private Service Binding into the Runtime deploy, so these
 * route tests stub `env.RUNTIME` with canned `RuntimeRpcResult` values. `resolveAdmission` defaults
 * to admitting {@link WORKOS_USER_ID}; override individual methods per test for the path under test.
 *
 * Each method is typed as a `MockedFunction` of the real contract method so `mock.calls[i][0]` is
 * the typed RPC input (e.g. `.actorToken` is type-safe in assertions, not `any`).
 *
 * New RPC delegates are stubbed automatically via Proxy; only methods with shared defaults live in
 * `runtime-rpc-stub-defaults.ts`.
 */
export type RuntimeRpcStub = {
  [K in keyof RuntimeRpc]: MockedFunction<RuntimeRpc[K]>;
};

export function createRuntimeRpcStub(): RuntimeRpcStub {
  const cache = new Map<string, MockedFunction<(...args: never[]) => unknown>>();

  return new Proxy({} as RuntimeRpcStub, {
    get(_target, property: string | symbol) {
      if (typeof property !== "string") {
        return undefined;
      }
      const existing = cache.get(property);
      if (existing !== undefined) {
        return existing;
      }
      const defaultImpl = RUNTIME_RPC_STUB_DEFAULTS[property as keyof RuntimeRpc];
      const mock = (
        defaultImpl === undefined ? vi.fn() : vi.fn(defaultImpl as (...args: never[]) => unknown)
      ) as MockedFunction<(...args: never[]) => unknown>;
      cache.set(property, mock);
      return mock;
    },
  });
}
