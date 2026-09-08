const REDACTED_SENTRY_MESSAGE = "[redacted by insecur]";

export interface SentryEventLike {
  environment?: string;
  event_id?: string;
  message?: string;
  exception?: { values?: SentryExceptionLike[] };
  request?: unknown;
  breadcrumbs?: unknown[];
  contexts?: unknown;
  debug_meta?: unknown;
  extra?: Record<string, unknown>;
  fingerprint?: unknown;
  logentry?: unknown;
  platform?: string;
  release?: string;
  tags?: Record<string, unknown>;
  threads?: unknown;
  timestamp?: number;
  type?: "transaction" | undefined;
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
  start_timestamp?: number;
  measurements?: unknown;
  spans?: SentrySpanLike[];
  transaction?: string;
  transaction_info?: unknown;
}

export interface SentrySanitizationMetadata {
  environment?: string;
  platform: "javascript";
  release?: string;
  service?: string;
}

interface SentryExceptionLike {
  value?: string;
}

/** Redact every telemetry field except explicit metadata allowlists. */
export function prepareSentryEvent<TEvent extends SentryEventLike>(
  event: TEvent,
  metadata: SentrySanitizationMetadata,
): TEvent {
  const sanitized: SentryEventLike = {
    ...safeEventIdentityAndTiming(event),
    ...safeConfiguredMetadata(metadata),
    message: REDACTED_SENTRY_MESSAGE,
    breadcrumbs: [],
    extra: {},
  };
  if (event.exception?.values?.length) {
    sanitized.exception = {
      values: event.exception.values.map(() => ({ value: REDACTED_SENTRY_MESSAGE })),
    };
  }
  if (metadata.service) {
    sanitized.tags = { service: metadata.service };
  }
  const trace = safeTraceContext(event.contexts);
  if (trace !== undefined) {
    sanitized.contexts = { trace };
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
  metadata: SentrySanitizationMetadata,
): TEvent {
  const sanitized: SentryTransactionLike = {
    ...prepareSentryEvent(event, metadata),
    type: "transaction",
    transaction_info: { source: "custom" },
    measurements: {},
  };
  if (isFiniteNumber(event.start_timestamp)) {
    sanitized.start_timestamp = event.start_timestamp;
  }
  const transaction = sanitizedTransactionName(event.transaction);
  if (transaction !== undefined) {
    sanitized.transaction = transaction;
  }
  if (event.spans) {
    sanitized.spans = event.spans.map(prepareSentrySpan);
  }
  return sanitized as TEvent;
}

function safeEventIdentityAndTiming(event: SentryEventLike): Partial<SentryEventLike> {
  return {
    ...(isHexId(event.event_id, 32) ? { event_id: event.event_id } : {}),
    ...(isFiniteNumber(event.timestamp) ? { timestamp: event.timestamp } : {}),
  };
}

function safeConfiguredMetadata(
  metadata: SentrySanitizationMetadata,
): Pick<SentryEventLike, "environment" | "platform" | "release"> {
  return {
    ...(metadata.environment ? { environment: metadata.environment } : {}),
    platform: metadata.platform,
    ...(metadata.release ? { release: metadata.release } : {}),
  };
}

function safeTraceContext(contexts: unknown): Record<string, string> | undefined {
  if (!isRecord(contexts) || !isRecord(contexts.trace)) return undefined;
  const trace = contexts.trace;
  const traceId = safeHexId(trace.trace_id, 32);
  const spanId = safeHexId(trace.span_id, 16);
  if (!traceId || !spanId) return undefined;
  return { trace_id: traceId, span_id: spanId, ...safeTraceMetadata(trace) };
}

function safeTraceMetadata(trace: Record<string, unknown>): Record<string, string> {
  const parentSpanId = safeHexId(trace.parent_span_id, 16);
  const op = sanitizedSpanOp(asString(trace.op));
  const status = asString(trace.status);
  return {
    ...(parentSpanId ? { parent_span_id: parentSpanId } : {}),
    ...(op !== undefined ? { op } : {}),
    ...(status === "ok" || status === "error" ? { status } : {}),
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeHexId(value: unknown, length: number): string | undefined {
  const stringValue = asString(value);
  return isHexId(stringValue, length) ? stringValue : undefined;
}
