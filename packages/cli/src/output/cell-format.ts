import { sanitizeDisplayText } from "./sanitize-display.js";

const ELLIPSIS_UNICODE = "…";
const ELLIPSIS_ASCII = "...";
const ID_TAIL_CHARS = 6;

let truncateIds = true;

/** Called once at CLI start (like configureColor). --full disables truncation. */
export function configureIdTruncation(full: boolean): void {
  truncateIds = !full;
}

export function resetIdTruncationForTests(): void {
  truncateIds = true;
}

/**
 * Shorten an opaque id for table columns: keep the semantic prefix whole
 * (`env_`, `grant_`, `evt_`), then 6 chars of the random tail, then an ellipsis.
 * Full ids stay in detail views and --json. Honors --full via configureIdTruncation.
 */
export function truncateId(id: string, ascii = false): string {
  if (!truncateIds) {
    return id;
  }
  const underscore = id.indexOf("_");
  const prefix = underscore === -1 ? "" : id.slice(0, underscore + 1);
  const tail = underscore === -1 ? id : id.slice(underscore + 1);
  if (tail.length <= ID_TAIL_CHARS) {
    return id;
  }
  const ellipsis = ascii ? ELLIPSIS_ASCII : ELLIPSIS_UNICODE;
  return `${prefix}${tail.slice(0, ID_TAIL_CHARS)}${ellipsis}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function absoluteShort(date: Date, now: Date): string {
  const month = MONTHS[date.getUTCMonth()] ?? "";
  const day = String(date.getUTCDate());
  const year = date.getUTCFullYear();
  return year === now.getUTCFullYear() ? `${month} ${day}` : `${month} ${day} ${String(year)}`;
}

function relativeUnit(abs: number): { value: number; unit: string } | undefined {
  const mins = Math.floor(abs / 60_000);
  if (mins < 60) {
    return { value: mins, unit: "m" };
  }
  const hours = Math.floor(abs / 3_600_000);
  if (hours < 24) {
    return { value: hours, unit: "h" };
  }
  const days = Math.floor(abs / 86_400_000);
  if (days < 7) {
    return { value: days, unit: "d" };
  }
  const weeks = Math.floor(days / 7);
  return weeks < 4 ? { value: weeks, unit: "w" } : undefined;
}

/**
 * Relative time for table cells: "just now", "3m ago", "2h ago", "2d ago",
 * "5w ago", then a compact absolute date past ~4 weeks. Future instants read
 * "in Xh". Invalid/empty input renders as an em-dash.
 */
function parseInstant(iso: string | null | undefined): Date | undefined {
  if (iso === null || iso === undefined || iso === "") {
    return undefined;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  const then = parseInstant(iso);
  if (then === undefined) {
    return "—";
  }
  const diff = now.getTime() - then.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) {
    return "just now";
  }
  const unit = relativeUnit(abs);
  if (unit === undefined) {
    return absoluteShort(then, now);
  }
  const magnitude = `${String(unit.value)}${unit.unit}`;
  return diff < 0 ? `in ${magnitude}` : `${magnitude} ago`;
}

/** Absolute wall-clock in the host's local zone, for detail-view expiry fields. */
export function absoluteLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return sanitizeDisplayText(iso);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} local`;
}

export function humanizeTtl(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${String(seconds / 3600)}h`;
  }
  if (seconds % 60 === 0) {
    return `${String(seconds / 60)}m`;
  }
  return `${String(seconds)}s`;
}

export type StatusTone = "ok" | "warn" | "danger" | "muted";

const TONE_BY_VALUE: Record<string, StatusTone> = {
  live: "ok",
  connected: "ok",
  active: "ok",
  valid: "ok",
  success: "ok",
  allowed: "ok",
  completed: "ok",
  succeeded: "ok",
  match: "ok",
  draft: "warn",
  pending: "warn",
  queued: "warn",
  running: "warn",
  validating: "warn",
  degraded: "warn",
  throttled: "warn",
  mismatch: "warn",
  revoked: "danger",
  denied: "danger",
  disconnected: "danger",
  failed: "danger",
  failure: "danger",
  aborted: "danger",
  abandoned: "danger",
  error: "danger",
  retained: "muted",
  discarded: "muted",
};

/** Map an enum value to a sparing tone. Unknown values fall through to muted. */
export function statusTone(value: string): StatusTone {
  return TONE_BY_VALUE[value.toLowerCase()] ?? "muted";
}
