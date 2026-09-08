const REDACTED_SENTRY_MESSAGE = "[redacted by insecur]";

export interface SentryEventLike {
  message?: string;
  exception?: { values?: SentryExceptionLike[] };
  request?: unknown;
  breadcrumbs?: unknown[];
  contexts?: unknown;
  debug_meta?: unknown;
  extra?: Record<string, unknown>;
  fingerprint?: unknown;
  logentry?: unknown;
  tags?: Record<string, unknown>;
  threads?: unknown;
  user?: unknown;
}

export interface SentrySpanLike {
  data: Record<string, unknown>;
  description?: string;
  end_timestamp?: number;
  links?: unknown;
  op?: string;
  parent_span_id?: string;
  span_id?: string;
  start_timestamp?: number;
  status?: string;
  timestamp?: number;
  trace_id?: string;
}

export interface SentryTransactionLike extends SentryEventLike {
  measurements?: unknown;
  spans?: SentrySpanLike[];
  transaction?: string;
  transaction_info?: unknown;
}

interface SentryExceptionLike {
  value?: string;
}

/** Redact every telemetry field except explicit metadata allowlists. */
export function prepareSentryEvent<TEvent extends SentryEventLike>(
  event: TEvent,
  service: string | undefined,
): TEvent {
  const sanitized: SentryEventLike = {
    message: REDACTED_SENTRY_MESSAGE,
    breadcrumbs: [],
    extra: {},
  };
  if (event.exception?.values?.length) {
    sanitized.exception = {
      values: event.exception.values.map(() => ({ value: REDACTED_SENTRY_MESSAGE })),
    };
  }
  if (service) {
    sanitized.tags = { service };
  }
  return sanitized as TEvent;
}

export function prepareSentrySpan<TSpan extends SentrySpanLike>(span: TSpan): TSpan {
  const sanitized: SentrySpanLike = {
    data: {},
    ...safeSpanIdentifiers(span),
    ...safeSpanTiming(span),
  };
  const op = sanitizedSpanOp(span.op);
  if (op !== undefined) {
    sanitized.op = op;
  }
  const description = sanitizedSpanDescription(span.op, span.description);
  if (description !== undefined) {
    sanitized.description = description;
  }
  return sanitized as TSpan;
}

export function prepareSentryTransaction<TEvent extends SentryTransactionLike>(
  event: TEvent,
  service: string | undefined,
): TEvent {
  const sanitized: SentryTransactionLike = {
    ...prepareSentryEvent(event, service),
    transaction_info: { source: "custom" },
    measurements: {},
  };
  const transaction = sanitizedTransactionName(event.transaction);
  if (transaction !== undefined) {
    sanitized.transaction = transaction;
  }
  if (event.spans) {
    sanitized.spans = event.spans.map(prepareSentrySpan);
  }
  return sanitized as TEvent;
}

function safeSpanIdentifiers(span: SentrySpanLike): Partial<SentrySpanLike> {
  return {
    ...(isHexId(span.trace_id, 32) ? { trace_id: span.trace_id } : {}),
    ...(isHexId(span.span_id, 16) ? { span_id: span.span_id } : {}),
    ...(isHexId(span.parent_span_id, 16) ? { parent_span_id: span.parent_span_id } : {}),
  };
}

function safeSpanTiming(span: SentrySpanLike): Partial<SentrySpanLike> {
  return {
    ...(isFiniteNumber(span.start_timestamp) ? { start_timestamp: span.start_timestamp } : {}),
    ...(isFiniteNumber(span.timestamp) ? { timestamp: span.timestamp } : {}),
    ...(isFiniteNumber(span.end_timestamp) ? { end_timestamp: span.end_timestamp } : {}),
    ...(span.status === "ok" || span.status === "error" ? { status: span.status } : {}),
  };
}

function sanitizedSpanOp(op: string | undefined): string | undefined {
  return /^(?:cli\.command|db|http\.(?:client|server))$/u.test(op ?? "") ? op : undefined;
}

function sanitizedSpanDescription(
  op: string | undefined,
  description: string | undefined,
): string | undefined {
  if (!description) return undefined;
  if (op?.startsWith("http.")) {
    const [method, target] = splitHttpTransactionName(description);
    return target && isHttpMethod(method) ? method : undefined;
  }
  if (op === "cli.command" && /^insecur [a-z.]+$/u.test(description)) return description;
  return undefined;
}

function sanitizedTransactionName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const [method, target] = splitHttpTransactionName(name);
  if (target && isHttpMethod(method)) return method;
  return /^insecur [a-z.]+$/u.test(name) ? name : undefined;
}

function splitHttpTransactionName(name: string): [string, string | undefined] {
  const match = /^(?<method>[A-Z]+)\s+(?<target>\S+)$/u.exec(name);
  if (match?.groups?.method && match.groups.target) {
    return [match.groups.method, match.groups.target];
  }
  return [name, undefined];
}

function isHttpMethod(value: string): boolean {
  return /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/u.test(value);
}

function isHexId(value: string | undefined, length: number): value is string {
  return value?.length === length && /^[a-f0-9]+$/u.test(value);
}

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}
