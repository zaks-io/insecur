import { parseAuditExportPublishedSigningKeys } from "@insecur/audit";
import { describe, expect, it } from "vitest";

import type { SiteEnv } from "./env.js";
import { tryStaticSiteResponse } from "./static-site-routes.js";

const AUDIT_SIGNING_KEYS_PATH = "/.well-known/insecur/audit-export-signing-keys.json";
const SECURITY_TXT_PATH = "/.well-known/security.txt";
const PUBLIC_KEY = "uyf4yAw8SnsMpN9tVr5glKfg0TFwss_hvYPyqt-Soos";

function siteEnv(overrides: Partial<SiteEnv> = {}): SiteEnv {
  return {
    AUDIT_EXPORT_SIGNING_PUBLIC_KEY: PUBLIC_KEY,
    DEPLOY_SHA: "sha",
    DEPLOY_RUN_ID: "1",
    DEPLOYED_AT: "1970-01-01T00:00:00.000Z",
    ...overrides,
  } as SiteEnv;
}

function requireResponse(response: Response | null): Response {
  if (response === null) {
    throw new Error("expected a Response from the audit-export signing-keys route");
  }
  return response;
}

describe("audit-export signing-keys route", () => {
  it("serves a document that parses via the @insecur/audit published-keys parser", async () => {
    const response = requireResponse(
      tryStaticSiteResponse(AUDIT_SIGNING_KEYS_PATH, "GET", siteEnv()),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");

    const parsed = parseAuditExportPublishedSigningKeys(await response.json());
    expect(parsed.current_version).toBe(1);
    expect(parsed.keys).toHaveLength(1);
    expect(parsed.keys[0]).toMatchObject({
      version: 1,
      public_key_base64url: PUBLIC_KEY,
      custody_evidence_ref: null,
    });
  });

  it("carries the per-environment injected public key", async () => {
    const otherKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const response = requireResponse(
      tryStaticSiteResponse(
        AUDIT_SIGNING_KEYS_PATH,
        "GET",
        siteEnv({ AUDIT_EXPORT_SIGNING_PUBLIC_KEY: otherKey }),
      ),
    );

    const parsed = parseAuditExportPublishedSigningKeys(await response.json());
    expect(parsed.keys[0]?.public_key_base64url).toBe(otherKey);
  });

  it("serves HEAD with no body", async () => {
    const response = requireResponse(
      tryStaticSiteResponse(AUDIT_SIGNING_KEYS_PATH, "HEAD", siteEnv()),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});

describe("security.txt route", () => {
  it("directs vulnerability reports to GitHub private vulnerability reporting", async () => {
    const response = requireResponse(tryStaticSiteResponse(SECURITY_TXT_PATH, "GET", siteEnv()));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(
      `Contact: https://github.com/zaks-io/insecur/security/advisories/new
Expires: 2027-07-09T00:00:00Z
Preferred-Languages: en
Canonical: https://insecur.cloud/.well-known/security.txt
`,
    );
  });

  it("serves HEAD with no body", async () => {
    const response = requireResponse(tryStaticSiteResponse(SECURITY_TXT_PATH, "HEAD", siteEnv()));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
