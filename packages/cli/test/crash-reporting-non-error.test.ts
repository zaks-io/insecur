import { describe, expect, it, vi } from "vitest";
import { createCliCrashReporter } from "../src/crash-reporting.js";

describe("CLI non-Error crash capture", () => {
  it("keeps primitive throw details without copying arbitrary object baggage", async () => {
    const captureException = vi.fn();
    const reporter = await createCliCrashReporter({
      argv: ["node", "insecur", "config", "show"],
      env: {},
      sentryRuntime: {
        init: vi.fn(),
        captureException,
        flush: vi.fn().mockResolvedValue(true),
      },
      userPreference: "on",
      version: "0.2.0",
    });

    await reporter.captureException("config parser stopped", { source: "unexpected" });
    await reporter.captureException(
      {
        message: "object detail must not be copied",
        secret: "arbitrary baggage",
      },
      { source: "unexpected" },
    );

    const primitiveError = captureException.mock.calls[0]?.[0] as Error;
    expect(primitiveError).toMatchObject({
      name: "NonErrorThrown",
      message: "Non-Error thrown: config parser stopped",
    });
    const objectError = captureException.mock.calls[1]?.[0] as Error;
    expect(objectError).toMatchObject({
      name: "NonErrorThrown",
      message: "Non-Error thrown (object)",
    });
    expect(JSON.stringify(objectError)).not.toContain("arbitrary baggage");
  });
});
