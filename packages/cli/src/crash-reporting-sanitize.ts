type SentryEvent = Record<string, unknown>;

const SAFE_EVENT_FIELDS = [
  "event_id",
  "timestamp",
  "start_timestamp",
  "platform",
  "level",
  "release",
  "environment",
  "transaction",
] as const;

const SAFE_TAGS = new Set(["command_family", "crash_source", "node_major", "platform", "service"]);

function pickSafeFields(record: SentryEvent): SentryEvent {
  const picked: SentryEvent = {};
  for (const field of SAFE_EVENT_FIELDS) {
    if (record[field] !== undefined) {
      picked[field] = record[field];
    }
  }
  return picked;
}

function sanitizeTags(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const tags: Record<string, string> = {};
  for (const [name, tagValue] of Object.entries(value as Record<string, unknown>)) {
    if (SAFE_TAGS.has(name) && typeof tagValue === "string") {
      tags[name] = tagValue;
    }
  }
  return Object.keys(tags).length === 0 ? undefined : tags;
}

function sanitizedExceptionEntry(): { type: string; value: string } {
  return { type: "Error", value: "Unexpected CLI failure" };
}

function sanitizeException(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("values" in value)) {
    return undefined;
  }
  const values = (value as { values?: unknown }).values;
  return Array.isArray(values)
    ? { values: values.map(() => sanitizedExceptionEntry()) }
    : undefined;
}

function addSafeTags(sanitized: SentryEvent, event: SentryEvent): void {
  const tags = sanitizeTags(event.tags);
  if (tags !== undefined) {
    sanitized.tags = tags;
  }
}

export function sanitizeSentryEvent(event: SentryEvent): SentryEvent {
  const sanitized = pickSafeFields(event);
  addSafeTags(sanitized, event);
  const exception = sanitizeException(event.exception);
  if (exception !== undefined) {
    sanitized.exception = exception;
  }
  return sanitized;
}

export function sanitizeSentryTransaction(event: SentryEvent): SentryEvent {
  const sanitized = pickSafeFields(event);
  addSafeTags(sanitized, event);
  return sanitized;
}
