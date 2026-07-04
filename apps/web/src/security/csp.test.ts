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
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce-value'");
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce-value'");
    expect(policy).not.toContain("script-src 'self';");
  });

  it("allows the sentry ingest origin when a dsn is configured", () => {
    const policy = buildContentSecurityPolicy("test-nonce-value", {
      sentryDsn: "https://public@example.ingest.sentry.io/1",
    });
    expect(policy).toContain("connect-src 'self' https://example.ingest.sentry.io");
  });

  it.each(["http://public@example.ingest.sentry.io/1", "not a dsn"])(
    "ignores an unsafe sentry dsn: %s",
    (sentryDsn) => {
      const policy = buildContentSecurityPolicy("test-nonce-value", { sentryDsn });
      expect(policy).toContain("connect-src 'self'");
      expect(policy).not.toContain("example.ingest.sentry.io");
    },
  );
});
