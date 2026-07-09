import { describe, expect, it } from "vitest";
import {
  DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
  cloudflareSentryOptions,
  sentryBrowserConfig,
  sentryBrowserConfigScript,
} from "./index.js";

describe("observability sentry config", () => {
  it("disables Sentry when no dsn is configured", () => {
    const options = cloudflareSentryOptions({});

    expect(options.enabled).toBe(false);
    expect(options.enableLogs).toBe(false);
    expect(options.enableRpcTracePropagation).toBe(true);
  });

  it("builds Cloudflare options from worker bindings", () => {
    const options = cloudflareSentryOptions({
      SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
      SENTRY_ENABLE_LOGS: "true",
      SENTRY_ENVIRONMENT: "preview",
      SENTRY_RELEASE: "version-1",
      SENTRY_SERVICE: "insecur-api",
    });

    expect(options).toMatchObject({
      enabled: true,
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: true,
      enableRpcTracePropagation: true,
      environment: "preview",
      release: "version-1",
      dataCollection: { userInfo: true },
      tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
      initialScope: { tags: { service: "insecur-api" } },
    });
  });

  it("builds browser config from worker bindings", () => {
    expect(
      sentryBrowserConfig({
        SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
        SENTRY_ENABLE_LOGS: "true",
        SENTRY_ENVIRONMENT: "preview",
        SENTRY_RELEASE: "version-1",
        SENTRY_SERVICE: "insecur-web",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: true,
      environment: "preview",
      release: "version-1",
      service: "insecur-web",
      tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
    });
  });

  it("keeps default PII out of production telemetry", () => {
    const production = cloudflareSentryOptions({
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_ENVIRONMENT: "production",
    });

    expect(production).not.toHaveProperty("dataCollection");
  });

  it("fails closed to the production posture when environment is missing", () => {
    const noEnvironment = cloudflareSentryOptions({
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    });

    expect(noEnvironment).not.toHaveProperty("dataCollection");
  });

  it("uses the shared trace sampling default", () => {
    expect(DEFAULT_SENTRY_TRACES_SAMPLE_RATE).toBe(1);
  });

  it("escapes browser config script json", () => {
    expect(
      sentryBrowserConfigScript({
        dsn: "https://example.test/<project>",
        tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
      }),
    ).toContain("\\u003cproject>");
  });
});
