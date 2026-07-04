import { describe, expect, it } from "vitest";
import {
  cloudflareSentryOptions,
  sentryBrowserConfig,
  sentryBrowserConfigScript,
} from "./index.js";

interface TestSentryEvent {
  message?: string;
  exception?: {
    values?: { type?: string; value?: string }[];
  };
  request?: unknown;
  breadcrumbs?: unknown[];
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}

type TestBeforeSend = (event: TestSentryEvent) => TestSentryEvent;

describe("observability sentry config", () => {
  it("disables Sentry when no dsn is configured", () => {
    const options = cloudflareSentryOptions({});
    const beforeSend = options.beforeSend as unknown as TestBeforeSend;

    expect(options.enabled).toBe(false);
    expect(options.dataCollection).toEqual({ userInfo: false, httpBodies: [] });
    expect(options.enableLogs).toBe(false);
    expect(options.enableRpcTracePropagation).toBe(true);
    expect(beforeSend({ request: { url: "https://example.test" } })).toEqual({
      message: "[redacted by insecur]",
      breadcrumbs: [],
      extra: {},
    });
  });

  it("builds Cloudflare options from worker bindings", () => {
    const options = cloudflareSentryOptions({
      SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
      SENTRY_ENABLE_LOGS: "true",
      SENTRY_ENVIRONMENT: "preview",
      SENTRY_RELEASE: "version-1",
      SENTRY_SERVICE: "insecur-api",
      SENTRY_TRACES_SAMPLE_RATE: "0.25",
    });
    const beforeSend = options.beforeSend as unknown as TestBeforeSend;

    expect(options).toMatchObject({
      enabled: true,
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: true,
      enableRpcTracePropagation: true,
      environment: "preview",
      release: "version-1",
      tracesSampleRate: 0.25,
      dataCollection: { userInfo: false, httpBodies: [] },
    });
    expect(
      beforeSend({
        message: "raw secret-bearing message",
        exception: { values: [{ type: "Error", value: "raw secret-bearing exception" }] },
        request: { headers: { authorization: "Bearer token" } },
        breadcrumbs: [{ message: "secret-ish path" }],
        extra: { raw: "payload" },
      }),
    ).toEqual({
      message: "[redacted by insecur]",
      exception: { values: [{ type: "Error", value: "[redacted by insecur]" }] },
      breadcrumbs: [],
      extra: {},
      tags: { service: "insecur-api" },
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
        SENTRY_TRACES_SAMPLE_RATE: "0.25",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: true,
      environment: "preview",
      release: "version-1",
      service: "insecur-web",
      tracesSampleRate: 0.25,
    });
  });

  it.each(["-0.01", "1.01", "not-a-number"])(
    "ignores invalid trace sample rate %s",
    (SENTRY_TRACES_SAMPLE_RATE) => {
      expect(
        sentryBrowserConfig({
          SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          SENTRY_TRACES_SAMPLE_RATE,
        }),
      ).toEqual({ dsn: "https://public@example.ingest.sentry.io/1" });
      expect(
        cloudflareSentryOptions({
          SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          SENTRY_TRACES_SAMPLE_RATE,
        }),
      ).not.toHaveProperty("tracesSampleRate");
    },
  );

  it("escapes browser config script json", () => {
    expect(sentryBrowserConfigScript({ dsn: "https://example.test/<project>" })).toContain(
      "\\u003cproject>",
    );
  });
});
