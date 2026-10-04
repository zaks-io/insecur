import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { userId } from "@insecur/domain";
import {
  cloudflareSentryOptions,
  sanitizeSentryRequest,
  withWorkerTraceCorrelation,
} from "@insecur/observability";
import { RuntimeService } from "@insecur/runtime/service";
import { closeRuntimeSql } from "@insecur/tenant-store";
import type { RuntimeRpc } from "@insecur/worker-kit";
import { apiClientFor } from "../../../../packages/worker-kit/src/rpc/api-client.js";
import * as Sentry from "@sentry/cloudflare";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireDatabaseUrl } from "../../../../packages/tenant-store/scripts/lib/env-local.mjs";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import app from "../../src/index.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;
const TRACE_ID = "0123456789abcdef0123456789abcdef";
const PARENT_SPAN_ID = "0123456789abcdef";
const SENTRY_DSN = "https://public@o42.ingest.sentry.io/1";
const PRIVATE_SENTINEL = "private-request-metadata-must-not-leave-worker";
const RUNTIME_TOKEN_SIGNING_SECRET = "trace-e2e-runtime-hop-secret-000000000000000000000000";

interface CapturedEvent {
  readonly type?: "transaction";
  readonly exception?: unknown;
  readonly transaction: string;
  readonly environment: string;
  readonly release: string;
  readonly tags: { readonly service: string };
  readonly contexts: {
    readonly trace: {
      readonly trace_id: string;
      readonly span_id: string;
      readonly parent_span_id: string;
    };
  };
  readonly spans?: readonly {
    readonly op: string;
    readonly trace_id: string;
    readonly parent_span_id: string;
  }[];
}

describeIntegration("Sentry Web to API to Runtime to Postgres trace continuity", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("emits real SDK envelopes with one trace and correctly parented real database spans", async () => {
    const envelopes: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url).hostname !== "o42.ingest.sentry.io") {
        throw new Error("Trace test attempted an unexpected external request");
      }
      const body = init?.body;
      if (typeof body === "string") envelopes.push(body);
      else if (body instanceof Uint8Array) envelopes.push(new TextDecoder().decode(body));
      else throw new Error("Sentry transport did not serialize an envelope");
      return new Response(null, { status: 200 });
    });

    const pending: Promise<unknown>[] = [];
    const nativeSpans: { name: string; attributes: Record<string, string> }[] = [];
    const context = {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      passThroughOnException: vi.fn(),
      tracing: {
        enterSpan<TResult>(
          name: string,
          callback: (span: { setAttribute(key: string, value: string): void }) => TResult,
        ): TResult {
          const attributes: Record<string, string> = {};
          nativeSpans.push({ name, attributes });
          return callback({
            setAttribute(key, value) {
              attributes[key] = value;
            },
          });
        },
      },
    };
    const sentryEnv = {
      SENTRY_DSN,
      SENTRY_ENVIRONMENT: "trace-test",
      SENTRY_RELEASE: "insecur@trace-test",
    };
    const databaseUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
    const runtime = new RuntimeService(
      { ...context } as never,
      {
        ...sentryEnv,
        SENTRY_SERVICE: "insecur-runtime",
        RUNTIME_TOKEN_SIGNING_SECRET,
        INSTANCE_ROOT_KEY_V1: { get: async () => RLS_TEST_ROOT_KEY_HEX },
        DB: { connectionString: databaseUrl },
      } as never,
    );
    const runtimeBinding = isolatedBinding(runtime) as unknown as RuntimeRpc;
    const signingSecret = testSessionSigningSecret();
    const actor = {
      type: "user" as const,
      userId: userId.brand(TEST_USER_ID),
      workosUserId: TEST_WORKOS_USER_ID,
      sessionId: "session_trace_e2e",
    };
    const session = await mintEphemeralSessionCredential({
      actor,
      signingSecret,
    });
    const apiEnv = {
      ...sentryEnv,
      SENTRY_SERVICE: "insecur-api",
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: signingSecret,
      RUNTIME_TOKEN_SIGNING_SECRET,
      RUNTIME: runtimeBinding,
    };
    const apiContext = { ...context };
    const webEnv = {
      ...sentryEnv,
      SENTRY_SERVICE: "insecur-web",
      SESSION_SIGNING_SECRET: signingSecret,
      API: isolatedBinding({
        fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
          return app.fetch(new Request(input, init), apiEnv as never, apiContext as never);
        },
      }),
    };
    const web = Sentry.withSentry(
      (env: typeof webEnv) => cloudflareSentryOptions(env, new Set(["GET /whoami"])),
      {
        fetch(_request: Request, env: typeof webEnv, ctx: ExecutionContext): Promise<Response> {
          return withWorkerTraceCorrelation(
            ctx,
            Sentry.getActiveSpan()?.spanContext().traceId,
            async () => {
              const result = await apiClientFor(env, actor).whoami();
              Sentry.captureException(new Error("Trace verification failure"));
              return Response.json(result);
            },
          );
        },
      },
    );
    const request = sanitizeSentryRequest(
      new Request("https://insecur-web.test/whoami", {
        headers: {
          Authorization: `Bearer ${session.credential}`,
          "sentry-trace": `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
          baggage: `sentry-org_id=42,sentry-trace_id=${TRACE_ID},sentry-transaction=${PRIVATE_SENTINEL}`,
        },
      }),
    );
    const response = await web.fetch(request, webEnv, context as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    for (let offset = 0; offset < pending.length;) {
      const current = pending.slice(offset);
      offset = pending.length;
      await Promise.all(current);
    }

    const events = envelopes.flatMap(parseEvents);
    const transactions = events.filter((event) => event.type === "transaction");
    const webTransaction = transactions.find((event) => event.tags.service === "insecur-web");
    const api = transactions.find((event) => event.tags.service === "insecur-api");
    const runtimeTransactions = transactions.filter(
      (event) => event.tags.service === "insecur-runtime",
    );
    expect(api).toBeDefined();
    expect(webTransaction).toBeDefined();
    expect(webTransaction?.transaction).toBe("GET /whoami");
    expect(api?.transaction).toBe("GET /v1/session/whoami");
    expect(runtimeTransactions.length).toBeGreaterThan(0);
    expect(webTransaction?.contexts.trace.parent_span_id).toBe(PARENT_SPAN_ID);
    expect(api?.contexts.trace.parent_span_id).toBe(webTransaction?.contexts.trace.span_id);
    const error = events.find((event) => event.exception !== undefined);
    expect(error?.tags.service).toBe("insecur-web");
    expect(error?.contexts.trace).toMatchObject({
      trace_id: TRACE_ID,
      span_id: webTransaction?.contexts.trace.span_id,
    });
    for (const event of transactions) {
      expect(event.contexts.trace.trace_id).toBe(TRACE_ID);
      expect(event.environment).toBe("trace-test");
      expect(event.release).toBe("insecur@trace-test");
    }
    let databaseSpanCount = 0;
    for (const event of runtimeTransactions) {
      expect(event.transaction).toMatch(/^POST \/rpc\/(?:resolveAdmission|resolveSessionWhoami)$/u);
      expect(event.contexts.trace.parent_span_id).toBe(api?.contexts.trace.span_id);
      const databaseSpans = event.spans?.filter((span) => span.op === "db") ?? [];
      databaseSpanCount += databaseSpans.length;
      for (const span of databaseSpans) {
        expect(span.trace_id).toBe(TRACE_ID);
        expect(span.parent_span_id).toBe(event.contexts.trace.span_id);
      }
    }
    expect(databaseSpanCount).toBeGreaterThan(0);
    expect(nativeSpans).toHaveLength(runtimeTransactions.length + 2);
    for (const span of nativeSpans) {
      expect(span).toEqual({
        name: "insecur.application",
        attributes: { "sentry.trace_id": TRACE_ID },
      });
    }
    const serialized = envelopes.join("\n");
    expect(serialized.includes(PRIVATE_SENTINEL)).toBe(false);
    expect(serialized.includes(databaseUrl)).toBe(false);
    expect(serialized.includes(session.credential)).toBe(false);
  });
});

function parseEvents(envelope: string): CapturedEvent[] {
  return envelope.split("\n").flatMap((line) => {
    try {
      const value = JSON.parse(line) as Partial<CapturedEvent>;
      return value.contexts !== undefined ? [value as CapturedEvent] : [];
    } catch {
      return [];
    }
  });
}

function isolatedBinding<T extends object>(binding: T): T {
  return new Proxy(binding, {
    get(target, property, receiver) {
      // The SDK identifies real JSRPC bindings through this random-property probe.
      if (
        typeof property === "string" &&
        property.startsWith("__some_property_that_will_never_exist__")
      ) {
        return () => undefined;
      }
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      // Real Service Bindings enter a separate Worker isolate with its own current scope.
      return (...args: unknown[]) =>
        Sentry.withScope(() =>
          Sentry.withActiveSpan(null, () => Reflect.apply(value, target, args)),
        );
    },
  });
}
