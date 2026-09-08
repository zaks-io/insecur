import * as Sentry from "@sentry/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withRuntimeRpcUnauthEntry } from "./runtime-rpc-unauthenticated-entry.js";
import { captureRuntimeRpcError } from "./runtime-rpc-sentry.js";

vi.mock("@sentry/cloudflare", () => ({ captureException: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("Runtime RPC error reporting", () => {
  it.each([
    "auth.insufficient_scope",
    "auth.high_assurance_required",
    "injection.grant_denied",
    "operation.not_found",
    "runtime_policy.not_found",
  ])("returns %s unchanged without reporting an exception", async (code) => {
    const result = await withRuntimeRpcUnauthEntry(async () => {
      throw Object.assign(new Error("private domain detail"), { code });
    });

    expect(result).toEqual({
      ok: false,
      error: { code, message: "runtime request failed", retryable: false },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    "store.unavailable",
    "auth.config_invalid",
    "validation.invalid_opaque_resource_id",
    "crypto.decrypt_failed",
  ])("still reports %s without raw domain text", async (code) => {
    const result = await withRuntimeRpcUnauthEntry(async () => {
      throw Object.assign(new Error("private domain detail"), { code });
    });

    expect(result.ok).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const reported = vi.mocked(Sentry.captureException).mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).not.toContain("private domain detail");
  });

  it("still reports unknown failures", async () => {
    await withRuntimeRpcUnauthEntry(async () => {
      throw new Error("private unexpected failure");
    });

    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it("reports a retryable failure even with an otherwise expected code", () => {
    captureRuntimeRpcError({
      code: "injection.grant_denied",
      message: "runtime request failed",
      retryable: true,
    });

    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });
});
