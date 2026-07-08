import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ExposesRuntimeRpc,
  MergedRuntimeServiceInstance,
} from "./runtime-service-rpc-conformance.js";
import { runtimeServiceExposesRuntimeRpc } from "./runtime-service-rpc-conformance.js";

describe("RuntimeService / RuntimeRpc conformance (INS-512)", () => {
  it("asserts the merged RuntimeService instance satisfies RuntimeRpc", () => {
    // The module under test only compiles because `runtimeServiceExposesRuntimeRpc` type-checks as
    // `true`; if `MergedRuntimeServiceInstance` ever drops or renames a `RuntimeRpc` method, that
    // binding's type narrows to `false` and `runtime-service-rpc-conformance.ts` fails `tsc` before
    // this test can even run. Asserting the value here keeps the failure attributable to a
    // `pnpm --filter @insecur/runtime typecheck` / `test` run, not a silent build-time drop.
    expect(runtimeServiceExposesRuntimeRpc).toBe(true);
    expectTypeOf(runtimeServiceExposesRuntimeRpc).toEqualTypeOf<true>();
  });

  it("resolves false for a RuntimeService surface missing a required RuntimeRpc method", () => {
    // Regression proof for the fail-on-drift acceptance criterion: a stand-in surface that omits
    // `consumeGrant` (a real RuntimeRpc keyring-bound method) must make `ExposesRuntimeRpc` resolve to
    // `false`, the same drift `runtime-service-rpc-conformance.ts` would hit for real if the mixin or
    // the class ever stopped exposing a contract method.
    type IncompleteRuntimeServiceSurface = Omit<MergedRuntimeServiceInstance, "consumeGrant">;

    expectTypeOf<ExposesRuntimeRpc<IncompleteRuntimeServiceSurface>>().toEqualTypeOf<false>();
  });
});
