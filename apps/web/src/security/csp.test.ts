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
    expect(policy).toContain(
      "script-src 'self' 'nonce-test-nonce-value' https://challenges.cloudflare.com",
    );
    expect(policy).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce-value'");
    expect(policy).not.toContain("script-src 'self';");
  });

  it("keeps form-action exactly 'self' when no AuthKit origin is configured", () => {
    const policy = buildContentSecurityPolicy("test-nonce-value");
    expect(policy).toContain("form-action 'self';");
    expect(policy).not.toContain("form-action 'self' ");
    expect(policy).not.toContain("*");
  });

  it("allows the WorkOS AuthKit origin in form-action when configured", () => {
    const policy = buildContentSecurityPolicy("test-nonce-value", {
      workosAuthkitOrigin: "https://tenant.authkit.app",
    });
    expect(policy).toContain("form-action 'self' https://tenant.authkit.app;");
    // Only the origin is allowed, never a path/query or wildcard.
    expect(policy).not.toContain("*");
  });

  it("allows every https origin in the WorkOS redirect chain (SDK host + AuthKit host)", () => {
    // The login POST 303s to https://api.workos.com/user_management/authorize, which itself
    // redirects to the tenant's hosted AuthKit domain; Chromium checks form-action against every
    // hop, so both origins must be allowlisted (INS-417).
    const policy = buildContentSecurityPolicy("test-nonce-value", {
      workosAuthkitOrigin: "https://api.workos.com https://tenant.authkit.app",
    });
    expect(policy).toContain(
      "form-action 'self' https://api.workos.com https://tenant.authkit.app;",
    );
    expect(policy).not.toContain("*");
  });

  it("deduplicates and drops unsafe entries from a mixed origin list", () => {
    const policy = buildContentSecurityPolicy("test-nonce-value", {
      workosAuthkitOrigin:
        "https://api.workos.com, http://insecure.example, https://api.workos.com, not-a-url",
    });
    expect(policy).toContain("form-action 'self' https://api.workos.com;");
    expect(policy).not.toContain("insecure.example");
    expect(policy).not.toContain("*");
  });

  it("uses only the origin of a fuller AuthKit URL and stays https-only", () => {
    const policy = buildContentSecurityPolicy("test-nonce-value", {
      workosAuthkitOrigin: "https://tenant.authkit.app/authorize?client_id=x",
    });
    expect(policy).toContain("form-action 'self' https://tenant.authkit.app;");
    expect(policy).not.toContain("/authorize");
  });

  it("keeps the valid origin and drops a wildcard host in a mixed list", () => {
    const policy = buildContentSecurityPolicy("test-nonce-value", {
      workosAuthkitOrigin: "https://a.com https://*.b.com",
    });
    expect(policy).toContain("form-action 'self' https://a.com;");
    expect(policy).not.toContain("*.b.com");
    expect(policy).not.toContain("*");
  });

  it.each([
    ["http scheme", "http://tenant.authkit.app"],
    ["not a url", "not a url"],
    ["empty", ""],
    ["whitespace only", "   "],
    ["wildcard host", "https://*.authkit.app"],
    ["semicolon in host", "https://evil.com;"],
    ["backtick in host", "https://ev`il.com"],
    ["brace in host", "https://ev{il}.com"],
    ["quote in host", 'https://ev"il.com'],
  ])(
    "fails closed to form-action 'self' for an unsafe AuthKit origin (%s)",
    (_label, workosAuthkitOrigin) => {
      const policy = buildContentSecurityPolicy("test-nonce-value", { workosAuthkitOrigin });
      expect(policy).toContain("form-action 'self';");
      expect(policy).not.toContain("authkit.app");
      expect(policy).not.toContain("evil");
      expect(policy).not.toContain("*");
      // The directive must not be terminated early or carry any injected token.
      expect(policy).not.toContain(";;");
    },
  );

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
