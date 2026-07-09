type WorkerFetch = (...args: never[]) => Response | Promise<Response>;

interface WorkerHandler {
  readonly fetch?: WorkerFetch;
}

/**
 * Preserve the trace ID and sampled flag while preventing caller-controlled Sentry dynamic context
 * from being forwarded into a Worker trace.
 */
export function requestWithoutSentryBaggage(request: Request): Request {
  if (!request.headers.has("baggage")) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.delete("baggage");
  return new Request(request, { headers });
}

export function sentryFetchWithBaggageGuard<TFetch extends WorkerFetch>(
  sentryHandler: WorkerHandler,
  fallback: TFetch,
): TFetch {
  return ((...args: never[]) => {
    const [request, ...remainingArgs] = args;
    const sanitizedArgs = [
      requestWithoutSentryBaggage(request as unknown as Request),
      ...remainingArgs,
    ] as never[];
    const sentryFetch = sentryHandler.fetch;
    return sentryFetch === undefined
      ? fallback(...sanitizedArgs)
      : sentryFetch.apply(sentryHandler, sanitizedArgs);
  }) as TFetch;
}
