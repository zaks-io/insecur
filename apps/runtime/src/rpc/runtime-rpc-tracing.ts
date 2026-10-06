import {
  sanitizeSentryRequest,
  withWorkerTraceCorrelation,
  type SentryBindings,
} from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

const SENTRY_RPC_META_KEY = "__sentry_rpc_meta__";
const NON_RPC_METHODS = new Set([
  "connect",
  "constructor",
  "dup",
  "email",
  "fetch",
  "queue",
  "scheduled",
  "tail",
  "tailStream",
  "test",
  "trace",
]);

interface RpcHost {
  readonly env: SentryBindings;
  readonly ctx: ExecutionContext;
}

type RpcMethod = (...args: unknown[]) => unknown;
type RpcConstructor = new (...args: never[]) => object;

export function splitTrailingSentryRpcMeta(args: readonly unknown[]): {
  readonly args: unknown[];
  readonly trace: Record<string, unknown> | undefined;
} {
  const last = args.at(-1);
  if (typeof last === "object" && last !== null && SENTRY_RPC_META_KEY in last) {
    const meta = last[SENTRY_RPC_META_KEY];
    if (typeof meta === "object" && meta !== null) {
      return { args: args.slice(0, -1), trace: meta as Record<string, unknown> };
    }
  }
  return { args: [...args], trace: undefined };
}

/** Rename the native SDK span and correlate it with Workers tracing, without opening another span. */
export function instrumentRuntimeRpcTracing(prototype: object): ReadonlySet<string> {
  const traceNames = new Set<string>();
  for (const name of rpcMethodNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) throw new Error(`Missing Runtime RPC descriptor: ${name}`);
    const original = descriptor.value as RpcMethod;
    const traceName = `POST /rpc/${name}`;
    traceNames.add(traceName);
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value(this: RpcHost, ...args: unknown[]): unknown {
        if (!this.env.SENTRY_DSN?.trim()) return original.apply(this, args);
        const span = Sentry.getActiveSpan();
        if (span) Sentry.updateSpanName(span, traceName);
        return withWorkerTraceCorrelation(this.ctx, span?.spanContext().traceId, () =>
          original.apply(this, args),
        );
      },
    });
  }
  return traceNames;
}

/** Guard metadata before Sentry 11's native WorkerEntrypoint RPC instrumentation consumes it. */
export function runtimeRpcWithBaggageGuard<TConstructor extends RpcConstructor>(
  sentryService: TConstructor,
  fallback: TConstructor,
): TConstructor {
  const methods = new Set(rpcMethodNames(fallback.prototype as object));
  return new Proxy(sentryService, {
    construct(_target, args) {
      const env = args[1] as SentryBindings;
      const enabled = Boolean(env.SENTRY_DSN?.trim());
      const instance = Reflect.construct(enabled ? sentryService : fallback, args) as object;
      return new Proxy(instance, {
        get(target, property) {
          const value: unknown = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          const method = value as RpcMethod;
          if (typeof property !== "string" || !methods.has(property)) return method.bind(target);
          return (...rawArgs: unknown[]) => {
            const { args: rpcArgs, trace } = splitTrailingSentryRpcMeta(rawArgs);
            if (!enabled) return Reflect.apply(method, target, rpcArgs);
            // An empty metadata object also gives direct calls a native root RPC span.
            return Reflect.apply(method, target, [
              ...rpcArgs,
              { [SENTRY_RPC_META_KEY]: safeRpcTrace(trace) },
            ]);
          };
        },
      });
    },
  });
}

function rpcMethodNames(prototype: object): string[] {
  return Object.getOwnPropertyNames(prototype).filter(
    (name) =>
      !NON_RPC_METHODS.has(name) &&
      typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === "function",
  );
}

function safeRpcTrace(trace: Record<string, unknown> | undefined): Record<string, string> {
  const headers = new Headers();
  for (const name of ["sentry-trace", "baggage"] as const) {
    const value = trace?.[name];
    if (typeof value === "string") headers.set(name, value);
  }
  const request = sanitizeSentryRequest(
    new Request("https://insecur-runtime.internal", { headers }),
  );
  const safe: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    safe[name] = value;
  });
  return safe;
}
