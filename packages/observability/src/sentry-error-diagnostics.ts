const REDACTED = "[redacted]";
const REDACTED_EMAIL = "[redacted-email]";
const REDACTED_IP = "[redacted-ip]";
const REDACTED_USER = "[redacted-user]";

export interface SentryErrorDiagnostics {
  message?: string;
  level?: string;
  exception?: { values: SentryExceptionDiagnostics[] };
  debug_meta?: { images: SentryDebugImageDiagnostics[] };
}

interface SentryExceptionDiagnostics {
  type?: string;
  value?: string;
  mechanism?: { type?: string; handled?: boolean };
  stacktrace?: { frames: SentryStackFrameDiagnostics[] };
}

interface SentryStackFrameDiagnostics {
  filename?: string;
  abs_path?: string;
  function?: string;
  module?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
  debug_id?: string;
}

interface SentryDebugImageDiagnostics {
  type?: string;
  code_file?: string;
  debug_file?: string;
  debug_id?: string;
  code_id?: string | null;
  image_addr?: string;
  image_size?: number;
}

/** Retain error grouping and source-map data while excluding arbitrary event payloads. */
export function prepareSentryErrorDiagnostics(event: object): SentryErrorDiagnostics {
  const source = event as Record<string, unknown>;
  return {
    ...scrubbedStringProperty(source, "message"),
    ...scrubbedStringProperty(source, "level"),
    ...exceptionDiagnostics(source.exception),
    ...debugMetaDiagnostics(source.debug_meta),
  };
}

function exceptionDiagnostics(value: unknown): Pick<SentryErrorDiagnostics, "exception"> {
  if (!isRecord(value) || !Array.isArray(value.values)) return {};
  return { exception: { values: value.values.map(exceptionValueDiagnostics) } };
}

function exceptionValueDiagnostics(value: unknown): SentryExceptionDiagnostics {
  if (!isRecord(value)) return {};
  return {
    ...scrubbedStringProperty(value, "type"),
    ...scrubbedStringProperty(value, "value"),
    ...mechanismDiagnostics(value.mechanism),
    ...stacktraceDiagnostics(value.stacktrace),
  };
}

function mechanismDiagnostics(value: unknown): Pick<SentryExceptionDiagnostics, "mechanism"> {
  if (!isRecord(value)) return {};
  const mechanism = {
    ...scrubbedStringProperty(value, "type"),
    ...(typeof value.handled === "boolean" ? { handled: value.handled } : {}),
  };
  return Object.keys(mechanism).length > 0 ? { mechanism } : {};
}

function stacktraceDiagnostics(value: unknown): Pick<SentryExceptionDiagnostics, "stacktrace"> {
  if (!isRecord(value) || !Array.isArray(value.frames)) return {};
  return { stacktrace: { frames: value.frames.map(stackFrameDiagnostics) } };
}

function stackFrameDiagnostics(value: unknown): SentryStackFrameDiagnostics {
  if (!isRecord(value)) return {};
  return {
    ...scrubbedStringProperty(value, "filename"),
    ...scrubbedStringProperty(value, "abs_path"),
    ...scrubbedStringProperty(value, "function", scrubIdentifier),
    ...scrubbedStringProperty(value, "module", scrubIdentifier),
    ...finiteNumberProperty(value, "lineno"),
    ...finiteNumberProperty(value, "colno"),
    ...(typeof value.in_app === "boolean" ? { in_app: value.in_app } : {}),
    ...scrubbedStringProperty(value, "debug_id"),
  };
}

function debugMetaDiagnostics(value: unknown): Pick<SentryErrorDiagnostics, "debug_meta"> {
  if (!isRecord(value) || !Array.isArray(value.images)) return {};
  return { debug_meta: { images: value.images.map(debugImageDiagnostics) } };
}

function debugImageDiagnostics(value: unknown): SentryDebugImageDiagnostics {
  if (!isRecord(value)) return {};
  return {
    ...scrubbedStringProperty(value, "type"),
    ...scrubbedStringProperty(value, "code_file"),
    ...scrubbedStringProperty(value, "debug_file"),
    ...scrubbedStringProperty(value, "debug_id"),
    ...nullableStringProperty(value, "code_id"),
    ...scrubbedStringProperty(value, "image_addr"),
    ...finiteNumberProperty(value, "image_size"),
  };
}

function scrubbedStringProperty(
  value: Record<string, unknown>,
  key: string,
  scrubber: (text: string) => string = scrubText,
): Record<string, string> {
  return typeof value[key] === "string" ? { [key]: scrubber(value[key]) } : {};
}

function nullableStringProperty(
  value: Record<string, unknown>,
  key: string,
): Record<string, string | null> {
  if (value[key] === null) return { [key]: null };
  return scrubbedStringProperty(value, key);
}

function finiteNumberProperty(value: Record<string, unknown>, key: string): Record<string, number> {
  return typeof value[key] === "number" && Number.isFinite(value[key]) ? { [key]: value[key] } : {};
}

function scrubText(value: string): string {
  return value
    .split(/([a-z][a-z0-9+.-]*:\/\/[^\s<>"']+)/giu)
    .map((part, index) => (index % 2 === 1 ? scrubUrl(part) : scrubNonUrlText(part, true)))
    .join("");
}

function scrubIdentifier(value: string): string {
  return scrubNonUrlText(value, false);
}

function scrubNonUrlText(value: string, scrubIpAddresses: boolean): string {
  const scrubbed = value
    .replace(
      /\bAuthorization(\s*:\s*)(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu,
      `Authorization$1${REDACTED}`,
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, `$1 ${REDACTED}`)
    .replace(
      /((?:["']token["'])|["']?\b(?:password|passwd|api[_-]?key|access[_-]?(?:key|token)|refresh[_-]?token|id[_-]?token|secret(?:[_-]?key)?|client[_-]?secret|private[_-]?key|credential|authorization)\b["']?)(\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/giu,
      redactAssignment,
    )
    .replace(
      /(\btoken)(\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/giu,
      redactAssignment,
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, REDACTED_EMAIL)
    .replace(/([/\\](?:Users|home)[/\\])[^/\\\s]+/giu, `$1${REDACTED_USER}`);
  if (!scrubIpAddresses) return scrubbed;
  return scrubIpv6(
    scrubbed.replace(
      /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/gu,
      REDACTED_IP,
    ),
  );
}

function redactAssignment(
  _match: string,
  key: string,
  separator: string,
  assignedValue: string,
): string {
  const quote = assignedValue.startsWith('"') ? '"' : assignedValue.startsWith("'") ? "'" : "";
  return `${key}${separator}${quote}${REDACTED}${quote}`;
}

function scrubUrl(url: string): string {
  const safeUserInfo = url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/iu, `$1${REDACTED}@`);
  const fragmentIndex = safeUserInfo.indexOf("#");
  const beforeFragment = fragmentIndex < 0 ? safeUserInfo : safeUserInfo.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? undefined : safeUserInfo.slice(fragmentIndex + 1);
  const queryIndex = beforeFragment.indexOf("?");
  const path = queryIndex < 0 ? beforeFragment : beforeFragment.slice(0, queryIndex);
  const query = queryIndex < 0 ? undefined : beforeFragment.slice(queryIndex + 1);
  const safeQuery = query === undefined ? "" : `?${scrubUrlParameters(query)}`;
  const safeFragment = fragment === undefined ? "" : `#${scrubUrlFragment(fragment)}`;
  return `${scrubNonUrlText(path, true)}${safeQuery}${safeFragment}`;
}

function scrubUrlFragment(fragment: string): string {
  return fragment.includes("=") ? scrubUrlParameters(fragment) : scrubNonUrlText(fragment, true);
}

function scrubUrlParameters(value: string): string {
  const scrubbed = new URLSearchParams();
  let changed = false;
  for (const [key, parameterValue] of new URLSearchParams(value)) {
    const safeValue = isSensitiveUrlParameter(key)
      ? REDACTED
      : scrubNonUrlText(parameterValue, true);
    changed ||= safeValue !== parameterValue;
    scrubbed.append(key, safeValue);
  }
  return changed ? scrubbed.toString() : value;
}

function isSensitiveUrlParameter(key: string): boolean {
  const words = key
    .replace(/([a-z\d])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .split(/[^a-z\d]+/u);
  return words.some((word) =>
    /^(?:address|auth|authorization|credential|email|key|name|password|passwd|phone|secret|token|user|username)$/u.test(
      word,
    ),
  );
}

function scrubIpv6(value: string): string {
  return value.replace(
    /(?<![A-Z0-9_:])[A-F0-9:]*:[A-F0-9:]*:[A-F0-9:]*(?![A-Z0-9_:])/giu,
    (candidate) => (isIpv6(candidate) ? REDACTED_IP : candidate),
  );
}

function isIpv6(value: string): boolean {
  if (value === "::") return false;
  if (!value.includes("::") && value.split(":").length !== 8) return false;
  if ((value.match(/::/gu)?.length ?? 0) > 1) return false;
  const parts = value.split(":").filter(Boolean);
  return parts.length <= 8 && parts.every((part) => /^[A-F0-9]{1,4}$/iu.test(part));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
