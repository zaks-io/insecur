import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeRpcStub } from "../test/support/runtime-rpc-stub.js";

import app from "./index.js";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: "test-session-signing-secret-at-least-32-chars",
  RUNTIME: createRuntimeRpcStub(),
};

const SENTINEL = "sentinel-plaintext-must-not-reach-logs";

describe("API unhandled error sanitization", () => {
  app.get("/__test__/unhandled", () => {
    throw new Error(SENTINEL);
  });

  it("logs only sanitized fields and never the raw error message or stack", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await app.request("/__test__/unhandled", { method: "GET" }, env);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Internal Server Error");

      expect(consoleError).toHaveBeenCalledTimes(1);
      const logged: unknown = consoleError.mock.calls[0]?.[0];
      expect(logged).toMatchObject({
        event: "api.unhandled_error",
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
        name: "Error",
      });
      if (typeof logged !== "object" || logged === null) {
        expect.fail("expected object log payload");
        return;
      }
      const requestIdValue = (logged as { requestId?: unknown }).requestId;
      expect(typeof requestIdValue).toBe("string");
      expect(requestIdValue).toMatch(/^req_/);
      expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    } finally {
      consoleError.mockRestore();
    }
  });
});
