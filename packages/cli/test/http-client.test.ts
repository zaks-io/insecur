import { afterEach, describe, expect, it, vi } from "vitest";
import { INSECUR_SESSION_CREDENTIAL_HEADER } from "@insecur/auth";
import { bytesToBase64Url } from "@insecur/domain";
import { createHttpApiClientForHost } from "../src/api/http-client.js";

describe("createHttpApiClientForHost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the CLI PKCE authorization URL without fetching", () => {
    const client = createHttpApiClientForHost("https://insecur.test");
    const url = new URL(
      client.createCliAuthorizationUrl({
        redirectUri: "http://127.0.0.1:49152/callback",
        state: "state_test",
        codeChallenge: "challenge_test",
        codeChallengeMethod: "S256",
      }),
    );
    expect(url.origin).toBe("https://insecur.test");
    expect(url.pathname).toBe("/v1/auth/cli/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:49152/callback");
    expect(url.searchParams.get("state")).toBe("state_test");
    expect(url.searchParams.get("code_challenge")).toBe("challenge_test");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("exchanges CLI PKCE code and reads the credential header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { sessionId: "sess_pkce", expiresAt: "2026-01-01T00:00:00.000Z" },
        }),
        {
          status: 200,
          headers: { [INSECUR_SESSION_CREDENTIAL_HEADER]: "credential_pkce" },
        },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.exchangeCliPkceSession({
      host: "https://insecur.test",
      code: "code_test",
      codeVerifier: "verifier_test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential).toBe("credential_pkce");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/auth/cli/pkce/exchange", "https://insecur.test"),
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
    const result = await client.exchangeCliPkceSession({
      host: "https://insecur.test",
      code: "code_test",
      codeVerifier: "verifier_test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.envelope.error.code).toBe("auth.required");
      expect(result.httpStatus).toBe(401);
    }
  });

  it("adds Sentry distributed-trace headers to HTTP API requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { actor: { type: "user", userId: "user_123" } },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test", {
      traceHeaders: () => ({
        "sentry-trace": "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
        baggage: "sentry-release=insecur-cli",
      }),
    });

    const result = await client.sessionWhoami({ bearerCredential: "credential_test" });

    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer credential_test");
    expect(headers.get("User-Agent")).toBe("insecur-cli/0.0.0");
    expect(headers.get("sentry-trace")).toBe("0123456789abcdef0123456789abcdef-0123456789abcdef-1");
    expect(headers.get("baggage")).toBe("sentry-release=insecur-cli");
  });

  it("starts device authorization and returns the metadata envelope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            deviceCode: "device_code_abc",
            userCode: "WDJB-MJHT",
            verificationUri: "https://workos.test/device",
            expiresInSeconds: 300,
            intervalSeconds: 5,
          },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.startCliDeviceAuthorization({
      host: "https://insecur.test",
      agentSession: true,
      requesterHost: "remote-agent-host",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.data.userCode).toBe("WDJB-MJHT");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/auth/cli/device/authorize", "https://insecur.test"),
      expect.objectContaining({ method: "POST" }),
    );
    const sentBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string;
    expect(JSON.parse(sentBody)).toEqual({
      agentSession: true,
      requesterHost: "remote-agent-host",
    });
  });

  it("reads the pending device-token status without a credential", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { status: "authorization_pending" } }), {
        status: 200,
      }),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.pollCliDeviceToken({
      host: "https://insecur.test",
      deviceCode: "device_code_abc",
      agentSession: false,
    });
    expect(result).toMatchObject({ ok: true, status: "authorization_pending" });
  });

  it("reads the credential header on device-token approval and forwards agentSession", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            sessionId: "sess_device",
            expiresAt: "2026-01-01T00:00:00.000Z",
            agentSessionId: "ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
          },
        }),
        {
          status: 200,
          headers: { [INSECUR_SESSION_CREDENTIAL_HEADER]: "credential_device" },
        },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.pollCliDeviceToken({
      host: "https://insecur.test",
      deviceCode: "device_code_abc",
      agentSession: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "authenticated") {
      expect(result.credential).toBe("credential_device");
      expect(result.envelope.data.agentSessionId).toBe("ags_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    }
    const sentBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string;
    expect(JSON.parse(sentBody)).toMatchObject({
      deviceCode: "device_code_abc",
      agentSession: true,
    });
  });

  it("returns the device-token error envelope on denial", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "auth.device_authorization_denied",
            message: "Denied.",
            retryable: false,
          },
        }),
        { status: 403 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.pollCliDeviceToken({
      host: "https://insecur.test",
      deviceCode: "device_code_abc",
      agentSession: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.envelope.error.code).toBe("auth.device_authorization_denied");
      expect(result.httpStatus).toBe(403);
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

  it("posts create-only blind secret writes when requested", async () => {
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
    const valueUtf8 = new TextEncoder().encode("import-value");
    await client.writeSecretByVariableKey({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      environmentId: "env_01TEST0000000000000000001" as never,
      variableKey: "API_KEY" as never,
      valueUtf8,
      createOnly: true,
    });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      variableKey: string;
      value: string;
      createOnly: boolean;
    };
    expect(body.createOnly).toBe(true);
    expect(body.value).toBe("import-value");
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

  it("issues an injection grant without returning sensitive values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            grantId: "igr_01TEST00000000000000000001",
            expiresAt: "2026-01-01T00:05:00.000Z",
          },
          meta: { requestId: "req_grant_issue" },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.issueInjectionGrant({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      environmentId: "env_01TEST0000000000000000001" as never,
      variableKey: "API_KEY" as never,
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://insecur.test/v1/orgs/org_01TEST00000000000000000001/runtime-injection/grants",
    );
    const body = JSON.parse((init as RequestInit).body as string) as {
      organizationId: string;
      projectId: string;
      environmentId: string;
      variableKey: string;
    };
    expect(body).toEqual({
      organizationId: "org_01TEST00000000000000000001",
      projectId: "prj_01TEST00000000000000000001",
      environmentId: "env_01TEST0000000000000000001",
      variableKey: "API_KEY",
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("consumes an injection grant and parses the delivery envelope", async () => {
    const sensitive = "runtime-secret-value";
    const encodedValueUtf8 = bytesToBase64Url(new TextEncoder().encode(sensitive));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          delivery: {
            grantId: "igr_01TEST00000000000000000001",
            variableKey: "API_KEY",
            secretId: "sec_01TEST00000000000000000001",
            secretVersionId: "sv_01TEST00000000000000000001",
            encodedValueUtf8,
          },
          meta: { requestId: "req_grant_consume" },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.consumeInjectionGrant({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_01TEST00000000000000000001" as never,
      grantId: "igr_01TEST00000000000000000001" as never,
      variableKey: "API_KEY" as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.delivery.encodedValueUtf8).toBe(encodedValueUtf8);
    }
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://insecur.test/v1/orgs/org_01TEST00000000000000000001/runtime-injection/grants/igr_01TEST00000000000000000001/consume",
    );
    expect(JSON.stringify(result)).not.toContain(sensitive);
  });

  it("lists audit events from the tenant-scoped audit-events route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            events: [
              {
                auditEventId: "aud_00000000000000000000000011",
                organizationId: "org_00000000000000000000000011",
                eventCode: "secret.non_protected_write",
                outcome: "success",
                resultCode: "audit.succeeded",
                actor: {
                  actorType: "user",
                  userId: "usr_00000000000000000000000011",
                },
                projectId: null,
                environmentId: null,
                resource: null,
                relatedResource: null,
                requestId: null,
                operationId: null,
                details: null,
                createdAt: "2026-07-01T00:00:00.000Z",
              },
            ],
            nextCursor: null,
          },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.listAuditEvents({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_00000000000000000000000011" as never,
      pageSize: 5,
      cursor: "cursor_input",
      filters: {
        eventCode: "secret.non_protected_write",
        createdAtFrom: "2026-07-01T00:00:00.000Z",
      },
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/v1/orgs/org_00000000000000000000000011/audit-events");
    expect(parsed.searchParams.get("pageSize")).toBe("5");
    expect(parsed.searchParams.get("cursor")).toBe("cursor_input");
    expect(parsed.searchParams.get("eventCode")).toBe("secret.non_protected_write");
    expect(parsed.searchParams.get("createdAtFrom")).toBe("2026-07-01T00:00:00.000Z");
    expect((init as RequestInit).method).toBe("GET");
    expect(JSON.stringify(result)).not.toMatch(/valueUtf8|plaintext|password|secret-value/i);
  });

  it("lists app connections on the org-scoped path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            connections: [
              {
                id: "conn_00000000000000000000000001",
                organizationId: "org_00000000000000000000000001",
                provider: "cloudflare",
                connectionMethod: "scoped-api-token",
                displayName: "Cloudflare workers",
                status: "active",
                statusReasonCode: null,
                hasActiveCredential: true,
                setupUserId: "usr_00000000000000000000000001",
                lastValidationCheckedAt: null,
                lastValidationOutcome: null,
                lastValidationReasonCode: null,
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:00:00.000Z",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.listAppConnections({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_00000000000000000000000001" as never,
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/v1/orgs/org_00000000000000000000000001/connections");
    expect((init as RequestInit).method).toBe("GET");
    expect(JSON.stringify(result)).not.toMatch(/tokenUtf8|encodedValueUtf8|providerCredential/i);
  });

  it("creates app connections on the org-scoped path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            connection: {
              id: "conn_00000000000000000000000001",
              organizationId: "org_00000000000000000000000001",
              provider: "cloudflare",
              connectionMethod: "scoped-api-token",
              displayName: "Cloudflare workers",
              status: "active",
              statusReasonCode: null,
              hasActiveCredential: true,
              setupUserId: "usr_00000000000000000000000001",
              lastValidationCheckedAt: null,
              lastValidationOutcome: null,
              lastValidationReasonCode: null,
              createdAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
            validation: { outcome: "success" },
            auditEventId: "aud_00000000000000000000000001",
          },
        }),
        { status: 200 },
      ),
    );
    const client = createHttpApiClientForHost("https://insecur.test");
    const result = await client.createAppConnection({
      host: "https://insecur.test",
      bearerCredential: "bearer_test",
      organizationId: "org_00000000000000000000000001" as never,
      appConnectionId: "conn_00000000000000000000000001" as never,
      provider: "cloudflare",
      connectionMethod: "scoped-api-token",
      displayName: "Cloudflare workers" as never,
      allowAccountId: "cf-account-123",
      allowWorkerScript: "my-api-production",
      tokenUtf8: new TextEncoder().encode("scoped-token"),
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/v1/orgs/org_00000000000000000000000001/connections");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      appConnectionId: "conn_00000000000000000000000001",
      provider: "cloudflare",
      connectionMethod: "scoped-api-token",
      allowAccountId: "cf-account-123",
      allowWorkerScript: "my-api-production",
    });
    expect(JSON.stringify(result)).not.toMatch(/encodedValueUtf8|providerCredential/i);
  });
});
