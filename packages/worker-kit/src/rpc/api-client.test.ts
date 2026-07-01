import {
  INSECUR_API_TOKEN_AUDIENCE,
  mintScopedAccessToken,
  verifyScopedAccessToken,
} from "@insecur/auth";
import { userId } from "@insecur/domain";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { describe, expect, it, vi } from "vitest";
import { apiClientFor } from "./api-client.js";

const actor = {
  type: "user" as const,
  userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  workosUserId: "user_01workos",
  sessionId: "session_bff",
};

const signingSecret = testSessionSigningSecret();

describe("apiClientFor", () => {
  it("mints a verifiable API-audience token and forwards it on the private binding hop", async () => {
    const apiFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const authorization = request.headers.get("Authorization") ?? "";
      const token = authorization.replace(/^Bearer\s+/u, "");
      const verified = await verifyScopedAccessToken({
        token,
        expectedAudience: INSECUR_API_TOKEN_AUDIENCE,
        signingSecret,
      });
      expect(verified.ok).toBe(true);
      return Response.json({ ok: true, data: { actorType: "user" } });
    });

    const client = apiClientFor(
      {
        API: { fetch: apiFetch } as unknown as Fetcher,
        SESSION_SIGNING_SECRET: signingSecret,
      },
      actor,
    );

    await client.whoami();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://insecur-api.internal/v1/session/whoami");
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get("Authorization")).toMatch(/^Bearer\s+\S+$/u);
  });

  it("reuses the minted token across calls on the same client", async () => {
    const authorizations: string[] = [];
    const apiFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers;
      if (headers instanceof Headers) {
        authorizations.push(headers.get("Authorization") ?? "");
      }
      return Response.json({ ok: true, data: { actorType: "user" } });
    });
    const client = apiClientFor(
      {
        API: { fetch: apiFetch } as unknown as Fetcher,
        SESSION_SIGNING_SECRET: signingSecret,
      },
      actor,
    );

    await client.whoami();
    await client.whoami();

    expect(authorizations).toHaveLength(2);
    expect(authorizations[0]).toBe(authorizations[1]);

    const token = (authorizations[0] ?? "").replace(/^Bearer\s+/u, "");
    const minted = await mintScopedAccessToken({
      actor,
      audience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(token).toBe(minted.token);
  });
});
