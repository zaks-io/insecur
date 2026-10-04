import * as Sentry from "@sentry/cloudflare";
import { describe, expect, it } from "vitest";
import {
  cloudflareSentryOptions,
  registerSentryRouteNames,
  sentryRouterTraceNames,
  sanitizeSentryRequest,
  withWorkerTraceCorrelation,
} from "./index.js";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const PARENT_ID = "0123456789abcdef";
const TRACE_HEADER = `${TRACE_ID}-${PARENT_ID}-1`;
const SENTINEL = "private-metadata-must-not-leave";

describe("safe Sentry trace propagation", () => {
  it("preserves only valid trace identity and sampling fields without consuming the request", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: SENTINEL,
      headers: {
        Authorization: "Bearer test-credential",
        "sentry-trace": TRACE_HEADER,
        baggage: `sentry-org_id=42,sentry-trace_id=${TRACE_ID},sentry-public_key=${TRACE_ID},sentry-sample_rate=0.25,sentry-sample_rand=0.125,sentry-sampled=true,sentry-transaction=${SENTINEL},other=${SENTINEL}`,
      },
    });
    const sanitized = sanitizeSentryRequest(request);
    expect(sanitized.headers.get("sentry-trace")).toBe(TRACE_HEADER);
    expect(sanitized.headers.get("baggage")).toBe(
      `sentry-org_id=42,sentry-trace_id=${TRACE_ID},sentry-public_key=${TRACE_ID},sentry-sampled=true,sentry-sample_rate=0.25,sentry-sample_rand=0.125`,
    );
    expect(sanitized.headers.get("Authorization")).toBe("Bearer test-credential");
    expect(request.headers.get("baggage")).toContain(SENTINEL);
    expect(await sanitized.text()).toBe(SENTINEL);
  });

  it.each([
    `sentry-org_id=${SENTINEL}`,
    "sentry-org_id=42,sentry-org_id=42",
    "sentry-org_id=42,sentry-org_id=43",
    "sentry-org_id=42;private=unsafe",
    `sentry-org_id=42,other=${"a".repeat(8192)}`,
  ])("rejects ambiguous or malformed baggage", (baggage) => {
    const sanitized = sanitizeSentryRequest(
      new Request("https://example.test", {
        headers: { "sentry-trace": TRACE_HEADER, baggage },
      }),
    );
    expect(sanitized.headers.get("baggage")).toBeNull();
  });

  it.each(["not-a-trace", `${"0".repeat(32)}-${PARENT_ID}-1`, `${TRACE_ID}-${"0".repeat(16)}-1`])(
    "drops invalid trace headers and their baggage",
    (trace) => {
      const sanitized = sanitizeSentryRequest(
        new Request("https://example.test", {
          headers: { "sentry-trace": trace, baggage: "sentry-org_id=42" },
        }),
      );
      expect(sanitized.headers.get("sentry-trace")).toBeNull();
      expect(sanitized.headers.get("baggage")).toBeNull();
    },
  );

  it("drops mismatched IDs, invalid numeric fields, and encoded free text", () => {
    const sanitized = sanitizeSentryRequest(
      new Request("https://example.test", {
        headers: {
          "sentry-trace": TRACE_HEADER,
          baggage: `sentry-org_id=42,sentry-trace_id=${"f".repeat(32)},sentry-public_key=private,sentry-sample_rate=2,sentry-sample_rand=NaN,sentry-sampled=${SENTINEL},sentry-release=private%20value`,
        },
      }),
    );
    expect(sanitized.headers.get("baggage")).toBe("sentry-org_id=42");
  });

  it.each([42, 43])(
    "continues only traces from the configured Sentry organization (%i)",
    assertTraceContinuation,
  );
});

describe("safe trace labels and native correlation", () => {
  it("registers browser route IDs and HTTP templates before the first request", () => {
    const names = sentryRouterTraceNames({
      routesByPath: { "/orgs/$orgId": {}, "/orgs/$orgId/approvals/$id": {} },
      routesById: { __root__: {}, "/orgs/$orgId/": {}, "/orgs/$orgId/approvals_/$id": {} },
    });
    const options = cloudflareSentryOptions({}, names);
    for (const name of ["GET /orgs/$orgId", "/orgs/$orgId/", "/orgs/$orgId/approvals_/$id"]) {
      expect(options.beforeSendTransaction?.({ transaction: name } as never, {})).toMatchObject({
        transaction: name,
      });
    }
    expect(names.has("__root__")).toBe(false);
    expect(
      options.beforeSendSpan?.({
        data: {},
        op: "function.tanstackstart",
        description: SENTINEL,
      } as never),
    ).toEqual({ data: {}, op: "function.tanstackstart" });
  });

  it("retains registered names while dropping concrete paths and database values", () => {
    const names = new Set<string>(["POST /rpc/writeSecret"]);
    registerSentryRouteNames(names, ["/orgs/$orgId"]);
    const options = cloudflareSentryOptions({}, names);
    for (const name of ["POST /rpc/writeSecret", "GET /orgs/$orgId", "/orgs/$orgId"]) {
      expect(options.beforeSendTransaction?.({ transaction: name } as never, {})).toMatchObject({
        transaction: name,
      });
    }
    expect(
      options.beforeSendSpan?.({
        data: {},
        op: "db",
        description: `SELECT '${SENTINEL}'`,
      } as never),
    ).not.toHaveProperty("description");
    expect(
      options.beforeSendTransaction?.({ transaction: `GET /orgs/${SENTINEL}` } as never, {}),
    ).toMatchObject({ transaction: "GET" });
  });

  it("adds only the SDK trace ID to a native span and preserves the callback result", async () => {
    const attributes = new Map<string, string>();
    const context = {
      tracing: {
        enterSpan<T>(
          name: string,
          callback: (span: { setAttribute: (key: string, value: string) => void }) => T,
        ): T {
          expect(name).toBe("insecur.application");
          return callback({
            setAttribute: (key, value) => {
              attributes.set(key, value);
            },
          });
        },
      },
    };
    await expect(
      withWorkerTraceCorrelation(context, TRACE_ID, () => Promise.resolve("result")),
    ).resolves.toBe("result");
    expect(Object.fromEntries(attributes)).toEqual({ "sentry.trace_id": TRACE_ID });
    expect(withWorkerTraceCorrelation(context, SENTINEL, () => "untraced")).toBe("untraced");
    expect(withWorkerTraceCorrelation(undefined, TRACE_ID, () => "unsupported")).toBe(
      "unsupported",
    );
    expect(() => withWorkerTraceCorrelation(context, TRACE_ID, throwTraceFailure)).toThrow(
      "failure",
    );
  });
});

async function assertTraceContinuation(orgId: number): Promise<void> {
  Sentry.setAsyncLocalStorageAsyncContextStrategy();
  const envelopes: string[] = [];
  const pending: Promise<unknown>[] = [];
  const context = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
  };
  const traceNames = new Set<string>();
  registerSentryRouteNames(traceNames, ["/v1/orgs/:orgId/secrets"]);
  const routeName = "GET /v1/orgs/:orgId/secrets";
  const options = {
    ...cloudflareSentryOptions(
      {
        SENTRY_DSN: "https://public@o42.ingest.sentry.io/1",
        SENTRY_SERVICE: "insecur-api",
        SENTRY_RELEASE: "trace-test",
        SENTRY_ENVIRONMENT: "test",
      },
      traceNames,
    ),
    transport: (transportOptions: Parameters<typeof Sentry.createTransport>[0]) =>
      Sentry.createTransport(transportOptions, (request) => {
        envelopes.push(
          typeof request.body === "string" ? request.body : new TextDecoder().decode(request.body),
        );
        return Promise.resolve({ statusCode: 200 });
      }),
  };
  const request = sanitizeSentryRequest(
    new Request(`https://example.test/v1/orgs/${SENTINEL}/secrets`, {
      headers: {
        "sentry-trace": TRACE_HEADER,
        baggage: `sentry-org_id=${String(orgId)},sentry-transaction=${SENTINEL}`,
      },
    }),
  );
  let traceId: string | undefined;
  const response = await Sentry.wrapRequestHandler(
    { options, request, context: context as never },
    () => {
      const root = Sentry.getActiveSpan();
      root?.updateName(routeName);
      traceId = root?.spanContext().traceId;
      Sentry.startSpan({ name: `SELECT '${SENTINEL}'`, op: "db" }, () => {
        Sentry.captureException(new Error("Trace diagnostic failure"));
      });
      return Promise.resolve(new Response(null));
    },
  );
  expect(response.status).toBe(200);
  await Promise.all(pending);
  const events = envelopes.flatMap((envelope) =>
    envelope.split("\n").map((line) => JSON.parse(line) as Sentry.Event),
  );
  const transaction = events.find((event) => event.type === "transaction" && event.contexts);
  const error = events.find((event) => event.exception);
  expect(transaction?.transaction).toBe(routeName);
  expect(transaction?.tags).toEqual({ service: "insecur-api" });
  expect(transaction?.contexts?.trace?.trace_id).toBe(traceId);
  expect(error?.contexts?.trace?.trace_id).toBe(traceId);
  expect(envelopes.join("\n")).not.toContain(SENTINEL);
  if (orgId === 42) {
    expect(traceId).toBe(TRACE_ID);
    expect(transaction?.contexts?.trace?.parent_span_id).toBe(PARENT_ID);
  } else {
    expect(traceId).not.toBe(TRACE_ID);
    expect(transaction?.contexts?.trace?.parent_span_id).toBeUndefined();
  }
}

function throwTraceFailure(): never {
  throw new Error("failure");
}
