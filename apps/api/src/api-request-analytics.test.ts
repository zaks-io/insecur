import { testSessionSigningSecret } from "@insecur/auth/testing";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeRpcStub } from "../test/support/runtime-rpc-stub.js";
import {
  API_REQUEST_ANALYTICS_BLOB_FIELDS,
  API_REQUEST_ANALYTICS_DOUBLE_FIELDS,
  recordApiRequestAnalytics,
} from "./api-request-analytics.js";
import app from "./index.js";

const SENTINEL = "sentinel-plaintext-must-not-reach-analytics";

function analyticsEnv(writeDataPoint: AnalyticsEngineDataset["writeDataPoint"]) {
  return {
    API_ANALYTICS: { writeDataPoint },
    DEPLOY_SHA: "test-deploy-sha",
    RUNTIME: createRuntimeRpcStub(),
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  };
}

describe("API request Analytics Engine telemetry", () => {
  it("records only fixed request metadata for a CLI request", async () => {
    const writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>();
    const response = await app.request(
      `/v1/session/whoami?ignored=${SENTINEL}`,
      { headers: { "User-Agent": "insecur-cli/1.2.3" } },
      analyticsEnv(writeDataPoint),
    );

    expect(response.status).toBe(401);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(API_REQUEST_ANALYTICS_BLOB_FIELDS).toEqual([
      "schema",
      "client_kind",
      "cli_version",
      "method",
      "route",
      "status",
      "deploy_sha",
    ]);
    expect(API_REQUEST_ANALYTICS_DOUBLE_FIELDS).toEqual(["count", "duration_ms"]);
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: [
        "api_request_v1",
        "cli",
        "1.2.3",
        "GET",
        "/v1/session/whoami",
        "401",
        "test-deploy-sha",
      ],
      doubles: [1, expect.any(Number)],
      indexes: ["api:cli"],
    });
    expect(JSON.stringify(writeDataPoint.mock.calls)).not.toContain(SENTINEL);
  });

  it("does not preserve an untrusted User-Agent", () => {
    const writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>();

    recordApiRequestAnalytics({
      env: analyticsEnv(writeDataPoint),
      durationMs: 8.4,
      method: "POST",
      routePath: "/v1/session/whoami",
      status: 200,
      userAgent: `insecur-cli/1.2.3 ${SENTINEL}`,
    });

    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: [
        "api_request_v1",
        "non_cli",
        "unknown",
        "POST",
        "/v1/session/whoami",
        "200",
        "test-deploy-sha",
      ],
      doubles: [1, 8],
      indexes: ["api:non_cli"],
    });
    expect(JSON.stringify(writeDataPoint.mock.calls)).not.toContain(SENTINEL);
  });

  it("does not preserve an API request body", async () => {
    const writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>();
    const response = await app.request(
      "/v1/onboarding/personal-organization",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "insecur-cli/1.2.3",
        },
        body: JSON.stringify({ code: SENTINEL, codeVerifier: SENTINEL }),
      },
      analyticsEnv(writeDataPoint),
    );

    expect(response.status).toBe(401);
    expect(JSON.stringify(writeDataPoint.mock.calls)).not.toContain(SENTINEL);
  });

  it("does not fail an API request when Analytics Engine rejects a write", async () => {
    const writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>(() => {
      throw new Error("analytics unavailable");
    });

    const response = await app.request("/healthz", {}, analyticsEnv(writeDataPoint));

    expect(response.status).toBe(200);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });
});
