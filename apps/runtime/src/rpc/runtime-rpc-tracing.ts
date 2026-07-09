import { cloudflareSentryOptions, type SentryBindings } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

/**
 * Callee-side Sentry trace continuation for Runtime RPC methods.
 *
 * `@sentry/cloudflare` (checked through 10.64.0) only implements the callee half of
 * `enableRpcTracePropagation` for Durable Objects: the caller's instrumented `env` appends a
 * `{ __sentry_rpc_meta__: { "sentry-trace", baggage } }` trailing argument to every RPC call, but
 * `withSentry` on a plain `WorkerEntrypoint` never extracts it, so Runtime RPCs produce no spans
 * and never join the caller's trace. This module fills that gap until upstream ships
 * WorkerEntrypoint support (getsentry/sentry-javascript#16898 shipped DO-only), at which point it
 * should be deleted.
 *
 * Each RPC invocation runs inside `Sentry.wrapRequestHandler` with a synthetic internal request
 * carrying the extracted trace headers. That is the SDK's public per-invocation seam: it creates
 * the client (nothing else initializes Sentry for RPC invocations — without it even
 * `captureException` is a no-op), scopes isolation, continues the trace, opens the span, and
 * flushes via `waitUntil`. The `.internal` host never resolves; it exists only to name the span.
 */

const SENTRY_RPC_META_KEY = "__sentry_rpc_meta__";
// postAuthRpc is the synchronous internal seam handing the delegated mixin methods their bound
// #post runner (runtime-service-delegated-post-auth-rpc-host.ts); wrapping it would replace the
// returned function with a Promise and nest a second trace inside every delegated call.
const NON_RPC_METHODS = new Set([
  "constructor",
  "fetch",
  "scheduled",
  "queue",
  "tail",
  "postAuthRpc",
]);

interface SentryRpcTraceData {
  readonly "sentry-trace"?: string;
  readonly baggage?: string;
}

interface RpcHost {
  readonly env: SentryBindings;
  readonly ctx: ExecutionContext;
}

type RpcMethod = (...args: unknown[]) => unknown;

export function splitTrailingSentryRpcMeta(args: readonly unknown[]): {
  readonly args: unknown[];
  readonly trace: SentryRpcTraceData | undefined;
} {
  const last = args.at(-1);
  if (typeof last === "object" && last !== null && SENTRY_RPC_META_KEY in last) {
    const meta = last[SENTRY_RPC_META_KEY];
    if (typeof meta === "object" && meta !== null) {
      return { args: args.slice(0, -1), trace: meta };
    }
  }
  return { args: [...args], trace: undefined };
}

export function instrumentRuntimeRpcTracing(prototype: object): void {
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (NON_RPC_METHODS.has(name)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      continue;
    }
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value: tracedRpcMethod(name, descriptor.value as RpcMethod),
    });
  }
}

function tracedRpcMethod(methodName: string, original: RpcMethod): RpcMethod {
  return function traced(this: RpcHost, ...rawArgs: unknown[]): unknown {
    const { args, trace } = splitTrailingSentryRpcMeta(rawArgs);
    const options = cloudflareSentryOptions(this.env);
    if (options.enabled !== true) {
      return original.apply(this, args);
    }

    const headers = new Headers();
    const sentryTrace = trace?.["sentry-trace"];
    if (sentryTrace) {
      headers.set("sentry-trace", sentryTrace);
    }
    if (trace?.baggage) {
      headers.set("baggage", trace.baggage);
    }
    const request = new Request(`https://insecur-runtime.internal/rpc/${methodName}`, {
      method: "POST",
      headers,
    });

    let value: unknown;
    return Sentry.wrapRequestHandler({ options, request, context: this.ctx }, async () => {
      value = await original.apply(this, args);
      return new Response(null, { status: 200 });
    }).then(() => value);
  };
}
