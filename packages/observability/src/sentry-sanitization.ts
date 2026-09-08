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
  links?: unknown;
  op?: string;
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

function redactUnsafeEventCollections(event: SentryEventLike): void {
  delete event.request;
  delete event.contexts;
  delete event.debug_meta;
  delete event.fingerprint;
  delete event.logentry;
  delete event.threads;
  delete event.user;
}

/** Redact every telemetry field except explicit metadata allowlists. */
export function prepareSentryEvent<TEvent extends SentryEventLike>(
  event: TEvent,
  service: string | undefined,
): TEvent {
  event.message = REDACTED_SENTRY_MESSAGE;
  for (const value of event.exception?.values ?? []) {
    value.value = REDACTED_SENTRY_MESSAGE;
  }
  redactUnsafeEventCollections(event);
  event.breadcrumbs = [];
  event.extra = {};
  if (service) {
    event.tags = { service };
  } else {
    delete event.tags;
  }
  return event;
}

export function prepareSentrySpan<TSpan extends SentrySpanLike>(span: TSpan): TSpan {
  delete span.links;
  span.data = {};
  const description = sanitizedSpanDescription(span.op, span.description);
  if (description === undefined) {
    delete span.description;
  } else {
    span.description = description;
  }
  return span;
}

export function prepareSentryTransaction<TEvent extends SentryTransactionLike>(
  event: TEvent,
  service: string | undefined,
): TEvent {
  prepareSentryEvent(event, service);
  if (event.transaction !== undefined) {
    event.transaction = sanitizeTransactionName(event.transaction);
  }
  event.transaction_info = { source: "custom" };
  event.measurements = {};
  if (event.spans) {
    event.spans = event.spans.map(prepareSentrySpan);
  }
  return event;
}

function sanitizedSpanDescription(
  op: string | undefined,
  description: string | undefined,
): string | undefined {
  if (!description) return undefined;
  if (op?.startsWith("http.")) {
    const [method, target] = splitHttpTransactionName(description);
    return target ? sanitizeTransactionName(`${method} ${target}`) : undefined;
  }
  if (op === "cli.command" && /^insecur [a-z.]+$/u.test(description)) return description;
  return isStaticSentryName(description) ? description : undefined;
}

function sanitizeTransactionName(name: string): string {
  const [method, target] = splitHttpTransactionName(name);
  if (!target) return isStaticSentryName(name) ? name : pathnameWithoutQuery(name);
  const pathname = pathnameWithoutQuery(target);
  return pathname ? `${method} ${pathname}` : method;
}

function splitHttpTransactionName(name: string): [string, string | undefined] {
  const match = /^(?<method>[A-Z]+)\s+(?<target>\S+)$/u.exec(name);
  if (match?.groups?.method && match.groups.target) {
    return [match.groups.method, match.groups.target];
  }
  return [name, undefined];
}

function isStaticSentryName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(value);
}

function pathnameWithoutQuery(value: string): string {
  try {
    return new URL(value, "https://insecur.invalid").pathname;
  } catch {
    return value.split("?", 1)[0] ?? "";
  }
}
