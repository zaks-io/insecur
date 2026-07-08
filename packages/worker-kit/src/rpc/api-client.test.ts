import { INSECUR_API_TOKEN_AUDIENCE, verifyScopedAccessToken } from "@insecur/auth";
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

  it("targets the metadata read paths with URL-encoded ids", async () => {
    const apiFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => Response.json({ ok: true, data: {} }),
    );
    const client = apiClientFor(
      {
        API: { fetch: apiFetch } as unknown as Fetcher,
        SESSION_SIGNING_SECRET: signingSecret,
      },
      actor,
    );

    await client.orgProjects("org_01JZ8E2QYQAAAAAAAAAAAAAAAA");
    await client.projectEnvironments("org_01JZ8E2QYQAAAAAAAAAAAAAAAA", "prj_01/../evil");
    await client.orgMembers("org_01JZ8E2QYQAAAAAAAAAAAAAAAA");
    await client.orgInvitations("org_01/../evil");
    await client.orgAuditEvents("org_01JZ8E2QYQAAAAAAAAAAAAAAAA", {
      pageSize: 10,
      cursor: "cursor_test",
      filters: {
        actorUserId: "usr_00000000000000000000000011",
        projectId: "prj_01/../evil",
        eventCode: "secret.non_protected_write",
        createdAtFrom: "2026-07-01T00:00:00.000Z",
      },
    });
    await client.orgHighAssuranceChallenges("org_01JZ8E2QYQAAAAAAAAAAAAAAAA");
    await client.orgHighAssuranceChallenge(
      "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
    );
    await client.denyOrgHighAssuranceChallenge(
      "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
    );

    const urls = apiFetch.mock.calls.map((call) => call[0]);
    expect(urls[0]).toBe(
      "https://insecur-api.internal/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/projects",
    );
    expect(urls[1]).toBe(
      "https://insecur-api.internal/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/projects/prj_01%2F..%2Fevil/environments",
    );
    expect(urls[2]).toBe(
      "https://insecur-api.internal/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/members",
    );
    expect(urls[3]).toBe("https://insecur-api.internal/v1/orgs/org_01%2F..%2Fevil/invitations");
    const auditUrl = new URL(urls[4] as string);
    expect(auditUrl.pathname).toBe("/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/audit-events");
    expect(auditUrl.searchParams.get("pageSize")).toBe("10");
    expect(auditUrl.searchParams.get("cursor")).toBe("cursor_test");
    expect(auditUrl.searchParams.get("actorUserId")).toBe("usr_00000000000000000000000011");
    expect(auditUrl.searchParams.get("projectId")).toBe("prj_01/../evil");
    expect(auditUrl.searchParams.get("eventCode")).toBe("secret.non_protected_write");
    expect(auditUrl.searchParams.get("createdAtFrom")).toBe("2026-07-01T00:00:00.000Z");
    expect(urls[5]).toBe(
      "https://insecur-api.internal/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/high-assurance-challenges",
    );
    expect(urls[6]).toBe(
      "https://insecur-api.internal/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/high-assurance-challenges/op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
    );
    expect(urls[7]).toBe(
      "https://insecur-api.internal/v1/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/high-assurance-challenges/op_01JZ8E2QYQAAAAAAAAAAAAAAAA/deny",
    );
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
    const verified = await verifyScopedAccessToken({
      token,
      expectedAudience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret,
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.actor).toEqual(actor);
    }
  });

  it("posts guided provisioning bodies as JSON with the scoped token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const apiFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return Response.json({ ok: true, data: {} });
    });
    const client = apiClientFor(
      {
        API: { fetch: apiFetch } as unknown as Fetcher,
        SESSION_SIGNING_SECRET: signingSecret,
      },
      actor,
    );

    await client.provisionPersonalOrganization({ organizationDisplayName: "Acme Corp" });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe("https://insecur-api.internal/v1/onboarding/personal-organization");
    expect(call?.init.method).toBe("POST");
    const headers = call?.init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toMatch(/^Bearer\s+\S+$/u);
    expect(JSON.parse(call?.init.body as string)).toEqual({
      organizationDisplayName: "Acme Corp",
    });
  });
});
