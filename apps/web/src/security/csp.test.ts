import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateCspNonce } from "./csp.js";

describe("csp", () => {
  it("generates a base64 nonce", () => {
    const nonce = generateCspNonce();
    expect(nonce.length).toBeGreaterThan(0);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("includes matching script and style nonce directives", () => {
    const nonce = "test-nonce-value";
    const policy = buildContentSecurityPolicy(nonce);
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce-value'");
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce-value'");
    expect(policy).not.toContain("script-src 'self';");
  });
});
