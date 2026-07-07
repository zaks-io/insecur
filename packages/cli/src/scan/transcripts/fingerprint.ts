import { createHash } from "node:crypto";

const MIN_FINGERPRINT_LENGTH = 8;

/** Stable SHA-256 fingerprint for correlating repeated findings locally. */
export function fingerprintSecretValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Redacted value shape for human and JSON output; never includes the full secret. */
export function redactValueShape(value: string): string {
  const length = value.length;
  if (length === 0) {
    return "(empty)";
  }
  if (length <= 4) {
    return `(${String(length)} chars)`;
  }

  const prefixLength = Math.min(4, Math.floor(length / 4));
  const suffixLength = Math.min(4, Math.floor(length / 4));
  const prefix = value.slice(0, prefixLength);
  const suffix = value.slice(-suffixLength);
  return `${prefix}…${suffix} (${String(length)} chars)`;
}

/** Minimum length for exact-match candidate comparison. */
export function isComparableCandidateValue(value: string): boolean {
  return value.length >= MIN_FINGERPRINT_LENGTH;
}
