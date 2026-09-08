import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
  cloudflareSentryOptions,
  initBrowserSentry,
  requestWithoutSentryBaggage,
  sentryBrowserConfig,
  sentryBrowserConfigScript,
  type BrowserSentryOptions,
} from "./index.js";

const METADATA_ONLY_DATA_COLLECTION = {
  cookies: false,
  frameContextLines: 0,
  genAI: { inputs: false, outputs: false },
  httpBodies: [],
  httpHeaders: { request: false, response: false },
  queryParams: false,
  stackFrameVariables: false,
  userInfo: false,
};

describe("observability sentry config", () => {
  it("uses the metadata-only posture in every environment", () => {
    for (const environment of [undefined, "preview", "production"]) {
      const options = cloudflareSentryOptions({
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_ENABLE_LOGS: "true",
        ...(environment ? { SENTRY_ENVIRONMENT: environment } : {}),
      });

      expect(options.dataCollection).toEqual(METADATA_ONLY_DATA_COLLECTION);
      expect(options.enableLogs).toBe(false);
      expect(options.strictTraceContinuation).toBe(true);
      expect(options.tracesSampleRate).toBe(DEFAULT_SENTRY_TRACES_SAMPLE_RATE);
    }
  });

  it("removes secret-bearing event, span, transaction, and log data", () => {
    const sentinel = "sensitive-value-must-not-leave";
    const options = cloudflareSentryOptions({
      SENTRY_ENVIRONMENT: "preview",
      SENTRY_RELEASE: "version-1",
      SENTRY_SERVICE: "insecur-api",
    });
    const event = options.beforeSend?.(
      {
        message: sentinel,
        exception: {
          values: [
            {
              type: sentinel,
              value: sentinel,
              mechanism: { data: { raw: sentinel } },
              stacktrace: { frames: [{ vars: { raw: sentinel }, context_line: sentinel }] },
            },
          ],
        },
        request: { url: `https://example.test/?token=${sentinel}` },
        breadcrumbs: [{ message: sentinel }],
        contexts: {
          raw: sentinel,
          trace: {
            data: { raw: sentinel },
            op: "http.server",
            span_id: "fedcba9876543210",
            trace_id: "fedcba9876543210fedcba9876543210",
          },
        },
        environment: sentinel,
        event_id: "0123456789abcdef0123456789abcdef",
        logger: sentinel,
        modules: { raw: sentinel },
        platform: sentinel,
        release: sentinel,
        sdkProcessingMetadata: { normalizedRequest: { data: sentinel }, ipAddress: sentinel },
        server_name: sentinel,
        transaction: sentinel,
        timestamp: 1,
        extra: { raw: sentinel },
        tags: { raw: sentinel },
        user: { email: sentinel },
      } as never,
      {},
    );
    const span = options.beforeSendSpan?.({
      data: { "db.query.text": `SELECT '${sentinel}'`, authorization: sentinel },
      description: `GET https://example.test/path?token=${sentinel}`,
      links: [{ attributes: { raw: sentinel } }],
      measurements: { raw: sentinel },
      op: "http.client",
      origin: sentinel,
      profile_id: sentinel,
      span_id: "0123456789abcdef",
      start_timestamp: 1,
      status: sentinel,
      timestamp: 2,
      trace_id: "0123456789abcdef0123456789abcdef",
    } as never);
    const transaction = options.beforeSendTransaction?.(
      {
        contexts: {
          trace: {
            data: { raw: sentinel },
            op: "http.server",
            origin: sentinel,
            parent_span_id: "fedcba9876543210",
            span_id: "0123456789abcdef",
            status: "ok",
            tags: { raw: sentinel },
            trace_id: "0123456789abcdef0123456789abcdef",
          },
        },
        event_id: "fedcba9876543210fedcba9876543210",
        request: { body: sentinel },
        measurements: { raw: sentinel },
        spans: [
          {
            data: { "db.query.text": `SELECT '${sentinel}'` },
            description: `SELECT '${sentinel}'`,
            op: "db",
          },
        ],
        start_timestamp: 1,
        timestamp: 2,
        type: "transaction",
        transaction: `GET /v1/secrets?token=${sentinel}`,
      } as never,
      {},
    );

    expect(JSON.stringify({ event, span, transaction })).not.toContain(sentinel);
    expect(event).toMatchObject({
      message: "[redacted by insecur]",
      environment: "preview",
      event_id: "0123456789abcdef0123456789abcdef",
      exception: { values: [{ value: "[redacted by insecur]" }] },
      breadcrumbs: [],
      extra: {},
      tags: { service: "insecur-api" },
      platform: "javascript",
      release: "version-1",
      timestamp: 1,
      contexts: {
        trace: {
          op: "http.server",
          span_id: "fedcba9876543210",
          trace_id: "fedcba9876543210fedcba9876543210",
        },
      },
    });
    expect(span).toEqual({
      data: {},
      description: "GET",
      op: "http.client",
      span_id: "0123456789abcdef",
      start_timestamp: 1,
      timestamp: 2,
      trace_id: "0123456789abcdef0123456789abcdef",
    });
    expect(transaction).toMatchObject({
      breadcrumbs: [],
      contexts: {
        trace: {
          op: "http.server",
          parent_span_id: "fedcba9876543210",
          span_id: "0123456789abcdef",
          status: "ok",
          trace_id: "0123456789abcdef0123456789abcdef",
        },
      },
      environment: "preview",
      event_id: "fedcba9876543210fedcba9876543210",
      extra: {},
      measurements: {},
      platform: "javascript",
      release: "version-1",
      start_timestamp: 1,
      timestamp: 2,
      transaction: "GET",
      type: "transaction",
    });
    expect(options.beforeSendLog?.({ body: sentinel } as never)).toBeNull();
  });

  it("drops invalid Sentry identity, timing, and trace metadata", () => {
    const options = cloudflareSentryOptions({ SENTRY_SERVICE: "insecur-api" });
    const event = options.beforeSend?.(
      {
        contexts: {
          trace: {
            op: "arbitrary.operation",
            span_id: "not-a-span-id",
            trace_id: "not-a-trace-id",
          },
        },
        event_id: "not-an-event-id",
        timestamp: Number.POSITIVE_INFINITY,
      } as never,
      {},
    );
    const transaction = options.beforeSendTransaction?.(
      {
        contexts: {
          trace: {
            span_id: "not-a-span-id",
            trace_id: "not-a-trace-id",
          },
        },
        event_id: "not-an-event-id",
        start_timestamp: Number.NaN,
        timestamp: Number.NEGATIVE_INFINITY,
        type: "transaction",
      } as never,
      {},
    );

    expect(event).not.toHaveProperty("contexts");
    expect(event).not.toHaveProperty("event_id");
    expect(event).not.toHaveProperty("timestamp");
    expect(transaction).not.toHaveProperty("contexts");
    expect(transaction).not.toHaveProperty("event_id");
    expect(transaction).not.toHaveProperty("start_timestamp");
    expect(transaction).not.toHaveProperty("timestamp");
    expect(transaction).toMatchObject({ platform: "javascript", type: "transaction" });
  });

  it("drops caller-controlled Sentry baggage and retains the trace header", () => {
    const request = new Request("https://api.insecur.cloud/v1/auth", {
      headers: {
        baggage: "sentry-transaction=sensitive-value",
        "sentry-trace": "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
      },
    });
    const sanitized = requestWithoutSentryBaggage(request);

    expect(sanitized.headers.get("baggage")).toBeNull();
    expect(sanitized.headers.get("sentry-trace")).toBe(
      "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
    );
  });

  it("builds a browser config without an auto-log switch", () => {
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
      environment: "preview",
      release: "version-1",
      service: "insecur-web",
      tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
    });
  });

  it("applies the same metadata-only sanitizers in the browser", () => {
    const sentinel = "browser-sensitive-value";
    const init = vi.fn<(options: BrowserSentryOptions<object>) => void>();
    vi.stubGlobal("window", {
      __INSECUR_SENTRY: {
        dsn: "https://public@example.ingest.sentry.io/1",
        service: "insecur-web",
        tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
      },
    });

    initBrowserSentry({}, { init, routerTracingIntegration: () => ({}) });
    const options = init.mock.calls[0]?.[0];
    const event = options?.beforeSend({
      message: sentinel,
      request: { body: sentinel },
      tags: { raw: sentinel },
    });

    expect(options).toMatchObject({
      dataCollection: METADATA_ONLY_DATA_COLLECTION,
      enableLogs: false,
    });
    expect(JSON.stringify(event)).not.toContain(sentinel);
    expect(event).toMatchObject({ tags: { service: "insecur-web" } });
    vi.unstubAllGlobals();
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
