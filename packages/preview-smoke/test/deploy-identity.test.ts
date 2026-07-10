import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPreviewDeployIdentity } from "../src/deploy-identity.js";
import type { PreviewConfig } from "../src/env.js";

const EXPECTED_SHA = "a".repeat(40);

const preview: PreviewConfig = {
  apiBaseUrl: "https://api.example.test",
  databaseUrl: "postgres://example.test/preview",
  expectedSha: EXPECTED_SHA,
  inviteeUserId: "invitee",
  inviteeWorkosUserId: "workos-invitee",
  noScopeUserId: "no-scope",
  noScopeWorkosUserId: "workos-no-scope",
  ownerUserId: "owner",
  ownerWorkosUserId: "workos-owner",
  signingSecret: "not-used",
  siteBaseUrl: "https://site.example.test",
  webBaseUrl: "https://web.example.test",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview deploy identity", () => {
  it("does not record a non-SHA response value in identity evidence", async () => {
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = input instanceof URL ? input.toString() : input;
      const service = url.includes("api.example.test")
        ? "insecur-api"
        : url.includes("web.example.test")
          ? "insecur-web"
          : "insecur-site";
      const deploySha = service === "insecur-site" ? "unexpected response text" : EXPECTED_SHA;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            deploySha,
            deployedAt: "2026-07-09T00:00:00.000Z",
            ok: true,
            runId: "run",
            service,
          }),
        ),
      );
    });

    const check = await checkPreviewDeployIdentity(preview);

    expect(check.identities).toContainEqual({
      deploy_sha: null,
      matches_expected: false,
      service: "insecur-site",
    });
  });
});
