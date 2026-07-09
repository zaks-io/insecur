import { describe, expect, it } from "vitest";
import {
  DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
  cloudflareSentryOptions,
  requestWithoutSentryBaggage,
  sentryBrowserConfig,
  sentryBrowserConfigScript,
  sentryFetchWithBaggageGuard,
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

interface TestSentrySpan {
  data: Record<string, unknown>;
  description?: string;
  links?: unknown;
  op?: string;
}

interface TestSentryTransaction extends TestSentryEvent {
  measurements?: unknown;
  spans?: TestSentrySpan[];
  transaction?: string;
  transaction_info?: unknown;
}

type TestBeforeSend = (event: TestSentryEvent) => TestSentryEvent;
type TestBeforeSendSpan = (span: TestSentrySpan) => TestSentrySpan;
type TestBeforeSendTransaction = (event: TestSentryTransaction) => TestSentryTransaction;

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
  it("disables Sentry when no dsn is configured", () => {
    const options = cloudflareSentryOptions({});
    const beforeSend = options.beforeSend as unknown as TestBeforeSend;

    expect(options.enabled).toBe(false);
    expect(options.dataCollection).toEqual(METADATA_ONLY_DATA_COLLECTION);
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
    });
    const beforeSend = options.beforeSend as unknown as TestBeforeSend;

    expect(options).toMatchObject({
      enabled: true,
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: true,
      enableRpcTracePropagation: true,
      environment: "preview",
      release: "version-1",
      tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
      dataCollection: METADATA_ONLY_DATA_COLLECTION,
    });
    expect(
      beforeSend({
        message: "raw secret-bearing message",
        exception: { values: [{ type: "Error", value: "raw secret-bearing exception" }] },
        request: { headers: { authorization: "Bearer token" } },
        breadcrumbs: [{ message: "secret-ish path" }],
        extra: { raw: "payload" },
        tags: { variableKey: "SECRET_BEARING_TAG" },
      }),
    ).toEqual({
      message: "[redacted by insecur]",
      exception: { values: [{ type: "Error", value: "[redacted by insecur]" }] },
      breadcrumbs: [],
      extra: {},
      tags: { service: "insecur-api" },
    });
  });

  it("removes OAuth state from transaction and span payloads", () => {
    const sentinel = "state-must-not-leave-in-sentry";
    const options = cloudflareSentryOptions({ SENTRY_SERVICE: "insecur-api" });
    const beforeSendSpan = options.beforeSendSpan as unknown as TestBeforeSendSpan;
    const beforeSendTransaction =
      options.beforeSendTransaction as unknown as TestBeforeSendTransaction;

    const span = beforeSendSpan({
      data: {
        "http.url": `https://api.insecur.cloud/v1/auth/cli/authorize?state=${sentinel}`,
        "http.request.header.authorization": `Bearer ${sentinel}`,
      },
      description: `GET https://api.insecur.cloud/v1/auth/cli/authorize?state=${sentinel}`,
      links: [{ attributes: { state: sentinel } }],
      op: "http.client",
    });
    const transaction = beforeSendTransaction({
      measurements: { raw: sentinel },
      request: { url: `https://api.insecur.cloud/v1/auth/cli/authorize?state=${sentinel}` },
      spans: [span],
      transaction: `GET /v1/auth/cli/authorize?state=${sentinel}`,
    });

    expect(JSON.stringify({ span, transaction })).not.toContain(sentinel);
    expect(span).toEqual({
      data: {},
      description: "GET /v1/auth/cli/authorize",
      op: "http.client",
    });
    expect(transaction).toMatchObject({
      breadcrumbs: [],
      extra: {},
      measurements: {},
      tags: { service: "insecur-api" },
      transaction: "GET /v1/auth/cli/authorize",
      transaction_info: { source: "custom" },
    });
  });

  it("retains the trace ID but drops caller-provided Sentry baggage", () => {
    const sentinel = "state-must-not-leave-in-sentry";
    const request = new Request(
      `https://api.insecur.cloud/v1/auth/cli/authorize?state=${sentinel}`,
      {
        headers: {
          baggage: `sentry-transaction=${sentinel},other-vendor=${sentinel}`,
          "sentry-trace": "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
        },
      },
    );

    const sanitized = requestWithoutSentryBaggage(request);

    expect(sanitized.headers.get("baggage")).toBeNull();
    expect(sanitized.headers.get("sentry-trace")).toBe(
      "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
    );
    expect(sanitized.url).toContain(`state=${sentinel}`);
  });

  it("guards wrapped and fallback Worker handlers from caller-provided baggage", () => {
    let sentryRequest: Request | undefined;
    let fallbackRequest: Request | undefined;
    const sentryFetch = (request: Request) => {
      sentryRequest = request;
      return new Response("sentry");
    };
    const fallback = (request: Request) => {
      fallbackRequest = request;
      return new Response("fallback");
    };
    const request = new Request("https://api.insecur.cloud/v1/auth?state=sentinel", {
      headers: {
        baggage: "sentry-transaction=sentinel",
        "sentry-trace": "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
      },
    });

    const guardedFetch = sentryFetchWithBaggageGuard({ fetch: sentryFetch }, fallback);

    expect(guardedFetch(request)).toBeInstanceOf(Response);
    expect(sentryRequest?.headers.get("baggage")).toBeNull();
    expect(sentryRequest?.headers.get("sentry-trace")).toBe(
      "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
    );

    const fallbackFetch = sentryFetchWithBaggageGuard({}, fallback);
    expect(fallbackFetch(request)).toBeInstanceOf(Response);
    expect(fallbackRequest?.headers.get("baggage")).toBeNull();
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

  it("keeps only parameterized Postgres query data in transactions", () => {
    const options = cloudflareSentryOptions({ SENTRY_SERVICE: "insecur-runtime" });
    const beforeSendTransaction =
      options.beforeSendTransaction as unknown as TestBeforeSendTransaction;

    expect(
      beforeSendTransaction({
        transaction: "RuntimeService.writeSecret",
        request: { headers: { authorization: "Bearer token" } },
        breadcrumbs: [{ message: "raw request detail" }],
        extra: { raw: "payload" },
        tags: { tenant: "secret-bearing-tag" },
        spans: [
          {
            op: "db",
            description: "SELECT * FROM secrets WHERE id = 'raw'",
            data: {
              "db.query.text": "SELECT * FROM secrets WHERE id = $1",
              "db.system.name": "postgres",
              "db.operation.name": "SELECT",
              "db.namespace": "insecur",
              "server.address": "internal-db.example",
            },
          },
          {
            op: "http.client",
            description: "https://example.test/raw-token",
            data: { "url.full": "https://example.test/raw-token" },
          },
        ],
      }),
    ).toEqual({
      message: "[redacted by insecur]",
      transaction: "RuntimeService.writeSecret",
      breadcrumbs: [],
      extra: {},
      measurements: {},
      tags: { service: "insecur-runtime" },
      transaction_info: { source: "custom" },
      spans: [
        {
          op: "db",
          description: "SELECT * FROM secrets WHERE id = $1",
          data: {
            "db.query.text": "SELECT * FROM secrets WHERE id = $1",
            "db.system.name": "postgres",
            "db.operation.name": "SELECT",
          },
        },
        { op: "http.client", data: {} },
      ],
    });
  });
});
