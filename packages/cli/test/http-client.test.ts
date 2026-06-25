import { afterEach, describe, expect, it, vi } from "vitest";
import { INSECUR_SESSION_CREDENTIAL_HEADER } from "@insecur/auth";
import { createHttpApiClientForHost } from "../src/api/http-client.js";

describe("createHttpApiClientForHost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exchanges CLI session and reads the credential header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { sessionId: "sess_test", expiresAt: "2026-01-01T00:00:00.000Z" },
        }),
        {
          status: 200,
          headers: { [INSECUR_SESSION_CREDENTIAL_HEADER]: "credential_test" },
        },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.exchangeCliSession({
      host: "https://insecur.test",
      cookieHeader: "wos-session=test",
      csrfHeader: "csrf_test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential).toBe("credential_test");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/auth/cli/exchange", "https://insecur.test"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns API error envelopes for failed exchange", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "auth.required",
            message: "Authentication is required.",
            retryable: false,
          },
        }),
        { status: 401 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.exchangeCliSession({
      host: "https://insecur.test",
      cookieHeader: "wos-session=test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.envelope.error.code).toBe("auth.required");
      expect(result.httpStatus).toBe(401);
    }
  });

  it("posts nested resourceIds for personal-organization provisioning", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            organizationId: "org_01TEST00000000000000000001",
            defaultTeamId: "team_01TEST0000000000000000001",
            ownerMembershipId: "mem_01TEST0000000000000000001",
            projectId: "prj_01TEST00000000000000000001",
            developmentEnvironmentId: "env_01TEST0000000000000000001",
          },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.provisionPersonalOrganization({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      environmentId: "env_01TEST0000000000000000001" as never,
    });
    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse((init as RequestInit).body as string) as {
      resourceIds: Record<string, string>;
    };
    expect(body.resourceIds.organizationId).toBe("org_01TEST00000000000000000001");
    expect(body.resourceIds.developmentEnvironmentId).toBe("env_01TEST0000000000000000001");
  });

  it("posts a blind secret write by variable key without logging the value", async () => {
    const sensitive = "super-secret-value-must-not-appear";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            secretId: "sec_01TEST00000000000000000001",
            secretVersionId: "sv_01TEST00000000000000000001",
            variableKey: "API_KEY",
            createdSecretShape: true,
          },
          meta: { requestId: "req_secret_write" },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const valueUtf8 = new TextEncoder().encode(sensitive);
    const result = await client.writeSecretByVariableKey({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      environmentId: "env_01TEST0000000000000000001" as never,
      variableKey: "API_KEY" as never,
      valueUtf8,
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://insecur.test/v1/orgs/org_01TEST00000000000000000001/projects/prj_01TEST00000000000000000001/environments/env_01TEST0000000000000000001/secrets/by-variable-key",
    );
    const body = JSON.parse((init as RequestInit).body as string) as {
      variableKey: string;
      value: string;
    };
    expect(body.variableKey).toBe("API_KEY");
    expect(body.value).toBe(sensitive);
    expect(JSON.stringify(result)).not.toContain(sensitive);
  });

  it("posts generated blind secret writes without a request-body value", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            secretId: "sec_01TEST00000000000000000001",
            secretVersionId: "sv_01TEST00000000000000000001",
            variableKey: "API_KEY",
            createdSecretShape: true,
          },
          meta: { requestId: "req_secret_write" },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.writeSecretByVariableKey({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      environmentId: "env_01TEST0000000000000000001" as never,
      variableKey: "API_KEY" as never,
      generate: { mode: "random", lengthBytes: 32 },
    });
    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse((init as RequestInit).body as string) as {
      variableKey: string;
      generate: { mode: string; lengthBytes: number };
      value?: string;
    };
    expect(body).toEqual({
      variableKey: "API_KEY",
      generate: { mode: "random", lengthBytes: 32 },
    });
    expect(body.value).toBeUndefined();
  });
});
