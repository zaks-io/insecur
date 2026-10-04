interface WorkerTraceContext {
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  readonly tracing?: {
    enterSpan<TResult>(
      name: string,
      callback: (span: { setAttribute(key: string, value: string): void }) => TResult,
    ): TResult;
  };
}

/** Native Workers traces cannot join SDK traces, but can carry their correlation ID. */
export function withWorkerTraceCorrelation<TResult>(
  context: WorkerTraceContext | undefined,
  traceId: string | undefined,
  run: () => TResult,
): TResult {
  if (!context?.tracing || !traceId || !/^(?!0{32}$)[a-f0-9]{32}$/u.test(traceId)) return run();
  return context.tracing.enterSpan("insecur.application", (span) => {
    span.setAttribute("sentry.trace_id", traceId);
    return run();
  });
}
