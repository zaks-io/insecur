import { withWorkerTraceCorrelation } from "./worker-trace-correlation.js";

type WorkerFetch = (...args: never[]) => Response | Promise<Response>;

interface WorkerHandler {
  readonly fetch?: WorkerFetch;
}

export function workerFetchWithTraceCorrelation<TFetch extends WorkerFetch>(
  fetch: TFetch,
  getTraceId: () => string | undefined,
): TFetch {
  return ((...args: never[]) =>
    withWorkerTraceCorrelation(
      args[2] as Parameters<typeof withWorkerTraceCorrelation>[0],
      getTraceId(),
      () => fetch(...args),
    )) as TFetch;
}

/** Retain trace identity and numeric sampling metadata without caller-controlled text. */
export function sanitizeSentryRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  const trace = headers.get("sentry-trace");
  if (trace && !/^(?!0{32}-)[a-f0-9]{32}-(?!0{16}(?:-|$))[a-f0-9]{16}(?:-[01])?$/u.test(trace)) {
    headers.delete("sentry-trace");
  }
  const baggage = safeSentryBaggage(headers.get("baggage"), headers.get("sentry-trace"));
  if (baggage) headers.set("baggage", baggage);
  else headers.delete("baggage");
  return new Request(request, { headers });
}

function parseSentryBaggage(baggage: string | null): Map<string, string> | undefined {
  if (!baggage || baggage.length > 8192) return undefined;
  const fields = new Map<string, string>();
  for (const member of baggage.split(",")) {
    const match = /^\s*(sentry-[a-z_]+)=([^;\s,=]+)\s*$/u.exec(member);
    if (!match) continue;
    const [, key, value] = match;
    if (!key || !value) continue;
    // Ambiguous duplicates must not choose a caller's preferred identity or sampling decision.
    if (fields.has(key)) return undefined;
    fields.set(key, value);
  }
  return fields;
}

const SAFE_BAGGAGE_VALIDATORS: Readonly<Record<string, (value: string, trace: string) => boolean>> =
  {
    "sentry-trace_id": (value, trace) => value === trace.slice(0, 32),
    "sentry-public_key": (value) => /^[a-f0-9]{32}$/u.test(value),
    "sentry-sampled": (value) => /^(?:true|false)$/u.test(value),
    "sentry-sample_rate": validSamplingNumber,
    "sentry-sample_rand": validSamplingNumber,
  };

function validSamplingNumber(value: string): boolean {
  return /^(?:0(?:\.[0-9]{1,16})?|1(?:\.0{1,16})?)$/u.test(value);
}

function safeSentryBaggage(baggage: string | null, trace: string | null): string {
  if (!trace) return "";
  const fields = parseSentryBaggage(baggage);
  if (!fields) return "";
  const orgId = validOrganizationId(fields.get("sentry-org_id"));
  if (!orgId) return "";
  const safe = [`sentry-org_id=${orgId}`];
  for (const [key, validate] of Object.entries(SAFE_BAGGAGE_VALIDATORS)) {
    const value = fields.get(key);
    if (value && validate(value, trace)) safe.push(`${key}=${value}`);
  }
  return safe.join(",");
}

export function sentryFetchWithBaggageGuard<TFetch extends WorkerFetch>(
  sentryHandler: WorkerHandler,
  fallback: TFetch,
): TFetch {
  return ((...args: never[]) => {
    const [request, ...remainingArgs] = args;
    const sanitizedArgs = [
      sanitizeSentryRequest(request as unknown as Request),
      ...remainingArgs,
    ] as never[];
    const sentryFetch = sentryHandler.fetch;
    return sentryFetch === undefined
      ? fallback(...sanitizedArgs)
      : sentryFetch.apply(sentryHandler, sanitizedArgs);
  }) as TFetch;
}

function validOrganizationId(value: string | undefined): string | undefined {
  return value && /^[1-9][0-9]{0,19}$/u.test(value) ? value : undefined;
}
