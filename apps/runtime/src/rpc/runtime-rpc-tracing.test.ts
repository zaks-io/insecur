import type {
  WorkerEntrypoint as CloudflareWorkerEntrypoint,
  env as cloudflareEnv,
} from "cloudflare:workers";
import { cloudflareSentryOptions, type SentryBindings } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";
import { describe, expect, it, vi } from "vitest";
import { RUNTIME_POST_AUTH_RPC } from "./runtime-service-delegated-post-auth-rpc-host.js";
import {
  instrumentRuntimeRpcTracing,
  runtimeRpcWithBaggageGuard,
  splitTrailingSentryRpcMeta,
} from "./runtime-rpc-tracing.js";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const PARENT_SPAN_ID = "0123456789abcdef";
const RPC_META = {
  __sentry_rpc_meta__: {
    "sentry-trace": `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
    baggage: `sentry-org_id=42,sentry-trace_id=${TRACE_ID}`,
  },
};
const SENTRY_ENV = {
  SENTRY_DSN: "https://public@o42.ingest.sentry.io/1",
  SENTRY_SERVICE: "insecur-runtime",
};
type TestConstructor = new (
  ctx: ExecutionContext,
  env: typeof cloudflareEnv,
) => CloudflareWorkerEntrypoint<SentryBindings>;

interface CapturedEvent {
  readonly type?: string;
  readonly transaction?: string;
  readonly exception?: unknown;
  readonly contexts: {
    readonly trace: { readonly trace_id: string; readonly parent_span_id?: string };
  };
  readonly spans?: unknown[];
}

function makeHost(env: SentryBindings = SENTRY_ENV) {
  const envelopes: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  const received: unknown[][] = [];
  const nativeSpans: { name: string; attributes: Record<string, string> }[] = [];
  const context = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    tracing: {
      enterSpan<T>(
        name: string,
        run: (span: { setAttribute(key: string, value: string): void }) => T,
      ): T {
        const attributes: Record<string, string> = {};
        nativeSpans.push({ name, attributes });
        return run({
          setAttribute(key, value) {
            attributes[key] = value;
          },
        });
      },
    },
  };
  // The SDK recognizes Cloudflare classes by the base constructor's name, including in Node tests.
  class WorkerEntrypoint {
    constructor(
      readonly ctx: typeof context,
      readonly env: SentryBindings,
    ) {}
  }
  class FakeService extends WorkerEntrypoint {
    #prefix = "key";
    async writeSecret(
      input: { key: string },
      ...extra: unknown[]
    ): Promise<{ ok: true; key: string }> {
      received.push([input, ...extra]);
      await Promise.resolve();
      return { ok: true, key: input.key };
    }
    async failing(): Promise<never> {
      throw new Error("rpc failure");
    }
    synchronous(): string {
      return this.#prefix;
    }
    fetch(): string {
      return "not-an-rpc-method";
    }
    [RUNTIME_POST_AUTH_RPC] = () => async (input: { key: string }) => ({
      ok: true as const,
      key: input.key,
    });
    async delegatedViaPostAuth(input: { key: string }): Promise<{ ok: true; key: string }> {
      return this[RUNTIME_POST_AUTH_RPC]()(input);
    }
  }
  const traceNames = instrumentRuntimeRpcTracing(FakeService.prototype);
  const options = vi.fn((bindings: SentryBindings) => ({
    ...cloudflareSentryOptions(bindings, traceNames),
    transport: () => ({
      send(envelope: unknown) {
        envelopes.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: async () => true,
    }),
  }));
  const NativeService = Sentry.withSentry<SentryBindings, unknown, unknown, TestConstructor>(
    options,
    FakeService as unknown as TestConstructor,
  );
  const Service = runtimeRpcWithBaggageGuard(
    NativeService,
    FakeService as unknown as TestConstructor,
  ) as unknown as typeof FakeService;
  const host = new Service(context, env);
  return {
    host,
    options,
    received,
    nativeSpans,
    envelopes,
    call(...args: unknown[]) {
      return Reflect.apply(host.writeSecret, host, args);
    },
    async events(): Promise<CapturedEvent[]> {
      for (let offset = 0; offset < pending.length;) {
        const current = pending.slice(offset);
        offset = pending.length;
        await Promise.all(current);
      }
      return envelopes.flatMap((envelope) => {
        const items = (envelope as [unknown, [unknown, unknown][]])[1];
        return items.flatMap(([, event]) =>
          typeof event === "object" && event !== null && "contexts" in event
            ? [event as CapturedEvent]
            : [],
        );
      });
    },
  };
}

describe("native runtime rpc tracing", () => {
  it("keeps entrypoint clients and transports separate in one isolate", async () => {
    const first = makeHost({ ...SENTRY_ENV, SENTRY_SERVICE: "insecur-runtime-first" });
    const second = makeHost();
    await first.call({ key: "first" });
    await second.call({ key: "second" });
    expect(await first.events()).toMatchObject([
      { transaction: "POST /rpc/writeSecret", tags: { service: "insecur-runtime-first" } },
    ]);
    expect(await second.events()).toMatchObject([
      { transaction: "POST /rpc/writeSecret", tags: { service: "insecur-runtime" } },
    ]);
  });

  it("splits the SDK's trailing rpc metadata without consuming ordinary input", () => {
    expect(splitTrailingSentryRpcMeta([{ key: "k" }, RPC_META])).toEqual({
      args: [{ key: "k" }],
      trace: RPC_META.__sentry_rpc_meta__,
    });
    expect(splitTrailingSentryRpcMeta([{ key: "k" }])).toEqual({
      args: [{ key: "k" }],
      trace: undefined,
    });
    expect(splitTrailingSentryRpcMeta([{ __sentry_rpc_meta__: null }])).toEqual({
      args: [{ __sentry_rpc_meta__: null }],
      trace: undefined,
    });
  });

  it("emits one native RPC transaction, continues the caller trace, and strips SDK metadata", async () => {
    const fixture = makeHost();
    await expect(fixture.call({ key: "k" }, RPC_META)).resolves.toEqual({ ok: true, key: "k" });
    expect(fixture.received).toEqual([[{ key: "k" }]]);
    const events = await fixture.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "transaction",
      transaction: "POST /rpc/writeSecret",
      tags: { service: "insecur-runtime" },
      contexts: { trace: { trace_id: TRACE_ID, parent_span_id: PARENT_SPAN_ID } },
    });
    expect(events[0]?.spans).toEqual([]);
    expect(fixture.nativeSpans).toEqual([
      { name: "insecur.application", attributes: { "sentry.trace_id": TRACE_ID } },
    ]);
    expect(fixture.options).toHaveBeenCalledTimes(1);
  });

  it("creates one root RPC span for calls without caller metadata", async () => {
    const fixture = makeHost();
    await expect(fixture.host.writeSecret({ key: "k" })).resolves.toEqual({ ok: true, key: "k" });
    const events = await fixture.events();
    expect(events).toHaveLength(1);
    expect(events[0]?.transaction).toBe("POST /rpc/writeSecret");
    expect(events[0]?.contexts.trace.parent_span_id).toBeUndefined();
    expect(events[0]?.contexts.trace.trace_id).toMatch(/^[a-f0-9]{32}$/u);
  });

  it("removes caller-controlled baggage before native trace continuation", async () => {
    const fixture = makeHost();
    await fixture.call(
      { key: "k" },
      {
        __sentry_rpc_meta__: {
          ...RPC_META.__sentry_rpc_meta__,
          baggage: `${RPC_META.__sentry_rpc_meta__.baggage},sentry-transaction=private-metadata,sentry-release=private-release,foreign=private-value`,
        },
      },
    );
    const events = await fixture.events();
    expect(events[0]?.contexts.trace.trace_id).toBe(TRACE_ID);
    expect(JSON.stringify(fixture.envelopes)).not.toContain("private-");
  });

  it.each([
    { "sentry-trace": "invalid-trace", baggage: "sentry-org_id=42" },
    { ...RPC_META.__sentry_rpc_meta__, baggage: "sentry-org_id=42,sentry-org_id=42" },
    { ...RPC_META.__sentry_rpc_meta__, baggage: "sentry-org_id=43" },
    { "sentry-trace": {}, baggage: {} },
  ])("starts a new trace for malformed or untrusted metadata %j", async (meta) => {
    const fixture = makeHost();
    await fixture.call({ key: "k" }, { __sentry_rpc_meta__: meta });
    const events = await fixture.events();
    expect(events).toHaveLength(1);
    expect(events[0]?.contexts.trace.trace_id).not.toBe(TRACE_ID);
    expect(events[0]?.contexts.trace.parent_span_id).toBeUndefined();
  });

  it("isolates concurrent callers without duplicating transactions", async () => {
    const fixture = makeHost();
    const otherTraceId = "1123456789abcdef0123456789abcdef";
    await Promise.all([
      fixture.call({ key: "one" }, RPC_META),
      fixture.call(
        { key: "two" },
        {
          __sentry_rpc_meta__: {
            "sentry-trace": `${otherTraceId}-${PARENT_SPAN_ID}-1`,
            baggage: `sentry-org_id=42,sentry-trace_id=${otherTraceId}`,
          },
        },
      ),
    ]);
    const events = await fixture.events();
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.contexts.trace.trace_id))).toEqual(
      new Set([TRACE_ID, otherTraceId]),
    );
    expect(fixture.received).toEqual([[{ key: "one" }], [{ key: "two" }]]);
  });

  it("preserves synchronous return values and private-field access through SDK proxies", async () => {
    const fixture = makeHost();
    expect(fixture.host.synchronous()).toBe("key");
    expect(await fixture.events()).toHaveLength(1);
  });

  it("propagates failures and flushes their native transaction and error", async () => {
    const fixture = makeHost();
    await expect(fixture.host.failing()).rejects.toThrow("rpc failure");
    const events = await fixture.events();
    expect(events.filter((event) => event.type === "transaction")).toHaveLength(1);
    expect(events.filter((event) => event.exception !== undefined)).toHaveLength(1);
  });

  it("bypasses Sentry and strips metadata with no configured DSN", async () => {
    const fixture = makeHost({});
    await expect(fixture.call({ key: "k" }, RPC_META)).resolves.toEqual({ ok: true, key: "k" });
    expect(fixture.received).toEqual([[{ key: "k" }]]);
    expect(fixture.host.synchronous()).toBe("key");
    expect(fixture.options).not.toHaveBeenCalled();
    expect(fixture.nativeSpans).toEqual([]);
    expect(await fixture.events()).toEqual([]);
  });

  it("leaves the symbol-only post-auth seam callable without another span", async () => {
    const fixture = makeHost();
    expect(typeof fixture.host[RUNTIME_POST_AUTH_RPC]()).toBe("function");
    await fixture.host.delegatedViaPostAuth({ key: "k" });
    const events = await fixture.events();
    expect(events).toHaveLength(1);
    expect(events[0]?.transaction).toBe("POST /rpc/delegatedViaPostAuth");
  });

  it("leaves lifecycle handlers outside the RPC metadata guard", () => {
    const fixture = makeHost({});
    expect(fixture.host.fetch()).toBe("not-an-rpc-method");
    expect(fixture.options).not.toHaveBeenCalled();
  });
});
