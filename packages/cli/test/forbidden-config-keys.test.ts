import { describe, expect, it } from "vitest";
import { assertNoForbiddenConfigKeys } from "../src/config/forbidden-config-keys.js";

describe("assertNoForbiddenConfigKeys", () => {
  it("rejects token-like keys in nested config", () => {
    expect(() =>
      assertNoForbiddenConfigKeys({ profiles: { prof_test: { sessionToken: "x" } } }),
    ).toThrow(/forbidden key/);
  });
});
