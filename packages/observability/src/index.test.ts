import { describe, expect, it } from "vitest";
import {
  cloudflareSentryOptions,
  sentryBrowserConfig,
  sentryBrowserConfigScript,
} from "./index.js";

describe("observability sentry config", () => {
  it("disables Sentry when no dsn is configured", () => {
    const options = cloudflareSentryOptions({});
    expect(options.enabled).toBe(false);
    expect(options.dataCollection).toEqual({ userInfo: false, httpBodies: [] });
    expect(options.enableLogs).toBe(false);
    expect(options.enableRpcTracePropagation).toBe(true);
  });

  it("builds browser config from worker bindings", () => {
    expect(
      sentryBrowserConfig({
        SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
        SENTRY_ENABLE_LOGS: "true",
        SENTRY_ENVIRONMENT: "preview",
        SENTRY_RELEASE: "version-1",
        SENTRY_TRACES_SAMPLE_RATE: "0.25",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: true,
      environment: "preview",
      release: "version-1",
      tracesSampleRate: 0.25,
    });
  });

  it("escapes browser config script json", () => {
    expect(sentryBrowserConfigScript({ dsn: "https://example.test/<project>" })).toContain(
      "\\u003cproject>",
    );
  });
});
