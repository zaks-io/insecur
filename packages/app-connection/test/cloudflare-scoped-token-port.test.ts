import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { AppConnectionError } from "../src/app-connection-error.js";
import { createCloudflareScopedTokenPort } from "../src/cloudflare-scoped-token-port.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createCloudflareScopedTokenPort", () => {
  it("verifies an active scoped token against account and worker script metadata", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/user/tokens/verify")) {
        return jsonResponse({ success: true, result: { status: "active", id: "token-id" } });
      }
      if (url.includes("/workers/scripts/my-api-production")) {
        return jsonResponse({ success: true, result: { id: "my-api-production" } });
      }
      if (url.includes("/accounts/cf-account-123")) {
        return jsonResponse({ success: true, result: { id: "cf-account-123" } });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const port = createCloudflareScopedTokenPort(fetchMock);
    const result = await port.verifyScopedToken({
      token: "scoped-token-value",
      allowedAccountId: "cf-account-123",
      allowedWorkerScript: "my-api-production",
    });

    expect(result).toEqual({
      tokenStatus: "active",
      providerAccountId: "cf-account-123",
      workerScriptReachable: true,
      hasBoundaryWarning: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails closed when token verification is not active", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ success: true, result: { status: "disabled", id: "token-id" } }),
    );

    const port = createCloudflareScopedTokenPort(fetchMock);
    await expect(
      port.verifyScopedToken({
        token: "scoped-token-value",
        allowedAccountId: "cf-account-123",
        allowedWorkerScript: "my-api-production",
      }),
    ).rejects.toMatchObject({
      code: APP_CONNECTION_ERROR_CODES.validationFailed,
    });
  });

  it("fails closed when the worker script is not reachable", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/user/tokens/verify")) {
        return jsonResponse({ success: true, result: { status: "active", id: "token-id" } });
      }
      if (url.includes("/accounts/cf-account-123")) {
        return jsonResponse({ success: true, result: { id: "cf-account-123" } });
      }
      return jsonResponse({ success: false, errors: [{ code: 10000 }] }, 403);
    });

    const port = createCloudflareScopedTokenPort(fetchMock);
    await expect(
      port.verifyScopedToken({
        token: "scoped-token-value",
        allowedAccountId: "cf-account-123",
        allowedWorkerScript: "my-api-production",
      }),
    ).rejects.toBeInstanceOf(AppConnectionError);
  });
});
