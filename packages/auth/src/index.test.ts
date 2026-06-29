import { describe, expect, it } from "vitest";
import * as authRoot from "./index.js";
import * as authTesting from "./testing/index.js";

describe("@insecur/auth public exports", () => {
  it("keeps fake WorkOS helpers and test signing fixtures off the production root", () => {
    expect("createFakeWorkOSSessionPort" in authRoot).toBe(false);
    expect("testSessionSigningSecret" in authRoot).toBe(false);
  });

  it("exposes fake WorkOS helpers only through the test-only subpath", () => {
    expect(typeof authTesting.createFakeWorkOSSessionPort).toBe("function");
    expect(typeof authTesting.testSessionSigningSecret).toBe("function");
  });
});
