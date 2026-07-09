import { createHash } from "node:crypto";

const MIN_FINGERPRINT_LENGTH = 8;

/** Stable SHA-256 fingerprint for correlating repeated findings locally. */
export function fingerprintSecretValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Minimum length for exact-match candidate comparison. */
export function isComparableCandidateValue(value: string): boolean {
  return value.length >= MIN_FINGERPRINT_LENGTH;
}
