import { parseSuccessEnvelopeList } from "./envelope.js";
import { parseAuditEventEntry } from "./audit-events-parse.js";
import type { ConsoleRecentActivity } from "./audit-events-types.js";

export type {
  ConsoleAuditActor,
  ConsoleAuditEvent,
  ConsoleAuditResource,
  ConsoleRecentActivity,
} from "./audit-events-types.js";
export { HOME_RECENT_ACTIVITY_PAGE_SIZE, CONSOLE_AUDIT_PAGE_SIZE } from "./audit-events-types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function successEnvelopeField(body: unknown, field: string): unknown {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return undefined;
  }
  return body.data[field];
}

/**
 * Parse the `GET /v1/orgs/:organizationId/audit-events` envelope from the API hop. Returns `null`
 * for anything but the expected success envelope so loaders fail closed to a metadata-safe not-found.
 */
export function parseOrgAuditEventsBody(body: unknown): ConsoleRecentActivity | null {
  const events = parseSuccessEnvelopeList(body, "events", parseAuditEventEntry);
  if (events === null) {
    return null;
  }
  const nextCursor = successEnvelopeField(body, "nextCursor");
  if (nextCursor !== null && typeof nextCursor !== "string") {
    return null;
  }
  return { events, nextCursor: nextCursor ?? null };
}
