import { beforeEach, describe, expect, it, vi } from "vitest";

const wrapRequestHandler = vi.hoisted(() =>
  vi.fn(
    async (
      _wrapperOptions: { options: unknown; request: Request; context: unknown },
      handler: () => Promise<Response>,
    ) => handler(),
  ),
);

vi.mock("@sentry/cloudflare", () => ({ wrapRequestHandler }));

const { instrumentRuntimeRpcTracing, splitTrailingSentryRpcMeta } =
  await import("./runtime-rpc-tracing.js");

const RPC_META = {
  __sentry_rpc_meta__: {
    "sentry-trace": "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
    baggage: "sentry-release=insecur-api",
  },
};

function makeHost(env: Record<string, string>) {
  class FakeService {
    readonly env = env;
    readonly ctx = { waitUntil: vi.fn() };

    async writeSecret(input: { key: string }): Promise<{ ok: true; key: string }> {
      return { ok: true, key: input.key };
    }

    async failing(): Promise<never> {
      throw new Error("rpc failure");
    }

    fetch(): string {
      return "not-an-rpc-method";
    }

    postAuthRpc(): (input: { key: string }) => Promise<{ ok: true; key: string }> {
      return async (input) => ({ ok: true, key: input.key });
    }

    async delegatedViaPostAuth(input: { key: string }): Promise<{ ok: true; key: string }> {
      const post = this.postAuthRpc();
      return post(input);
    }
  }
  instrumentRuntimeRpcTracing(FakeService.prototype);
  return new FakeService();
}

describe("runtime rpc tracing", () => {
  beforeEach(() => {
    wrapRequestHandler.mockClear();
  });

  it("splits the SDK's trailing rpc meta argument", () => {
    expect(splitTrailingSentryRpcMeta([{ key: "k" }, RPC_META])).toEqual({
      args: [{ key: "k" }],
      trace: RPC_META.__sentry_rpc_meta__,
    });
    expect(splitTrailingSentryRpcMeta([{ key: "k" }])).toEqual({
      args: [{ key: "k" }],
      trace: undefined,
    });
  });

  it("continues the caller trace through wrapRequestHandler with the extracted headers", async () => {
    const host = makeHost({ SENTRY_DSN: "https://public@example.ingest.sentry.io/1" });

    // The API's Sentry-instrumented env appends the meta as a trailing argument on every RPC call.
    const callWithMeta = host.writeSecret as unknown as (...args: unknown[]) => Promise<unknown>;
    const result = await callWithMeta.call(host, { key: "k" }, RPC_META);

    expect(result).toEqual({ ok: true, key: "k" });
    expect(wrapRequestHandler).toHaveBeenCalledTimes(1);
    const wrapperOptions = wrapRequestHandler.mock.calls[0]?.[0];
    expect(wrapperOptions?.request.url).toBe("https://insecur-runtime.internal/rpc/writeSecret");
    expect(wrapperOptions?.request.headers.get("sentry-trace")).toBe(
      RPC_META.__sentry_rpc_meta__["sentry-trace"],
    );
    expect(wrapperOptions?.request.headers.get("baggage")).toBe(
      RPC_META.__sentry_rpc_meta__.baggage,
    );
    expect(wrapperOptions?.context).toBe(host.ctx);
  });

  it("starts a new trace when the caller sent no rpc meta", async () => {
    const host = makeHost({ SENTRY_DSN: "https://public@example.ingest.sentry.io/1" });

    await expect(host.writeSecret({ key: "k" })).resolves.toEqual({ ok: true, key: "k" });
    expect(wrapRequestHandler).toHaveBeenCalledTimes(1);
    const wrapperOptions = wrapRequestHandler.mock.calls[0]?.[0];
    expect(wrapperOptions?.request.headers.get("sentry-trace")).toBeNull();
  });

  it("propagates rejections through the traced path", async () => {
    const host = makeHost({ SENTRY_DSN: "https://public@example.ingest.sentry.io/1" });

    await expect(host.failing()).rejects.toThrow("rpc failure");
  });

  it("bypasses Sentry entirely when no DSN is configured", async () => {
    const host = makeHost({});

    await expect(host.writeSecret({ key: "k" })).resolves.toEqual({ ok: true, key: "k" });
    expect(wrapRequestHandler).not.toHaveBeenCalled();
  });

  it("strips the meta argument even when Sentry is disabled", async () => {
    const host = makeHost({});

    const callWithMeta = host.writeSecret as unknown as (...args: unknown[]) => Promise<unknown>;
    const result = await callWithMeta.call(host, { key: "k" }, RPC_META);

    expect(result).toEqual({ ok: true, key: "k" });
  });

  it("leaves the synchronous postAuthRpc seam unwrapped so delegated methods get a callable runner", async () => {
    const host = makeHost({ SENTRY_DSN: "https://public@example.ingest.sentry.io/1" });

    // postAuthRpc must synchronously return the runner function even with Sentry enabled;
    // wrapping it would hand every delegated post-auth RPC a Promise instead of a function.
    const runner = host.postAuthRpc();
    expect(typeof runner).toBe("function");
    expect(wrapRequestHandler).not.toHaveBeenCalled();

    await expect(host.delegatedViaPostAuth({ key: "k" })).resolves.toEqual({ ok: true, key: "k" });
    expect(wrapRequestHandler).toHaveBeenCalledTimes(1);
    const wrapperOptions = wrapRequestHandler.mock.calls[0]?.[0];
    expect(wrapperOptions?.request.url).toBe(
      "https://insecur-runtime.internal/rpc/delegatedViaPostAuth",
    );
  });

  it("leaves worker lifecycle handlers untouched", () => {
    const host = makeHost({ SENTRY_DSN: "https://public@example.ingest.sentry.io/1" });

    expect(host.fetch()).toBe("not-an-rpc-method");
    expect(wrapRequestHandler).not.toHaveBeenCalled();
  });
});
