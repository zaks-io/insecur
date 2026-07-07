import { createHash, createHmac, randomBytes } from "node:crypto";

const MIN_FINGERPRINT_LENGTH = 8;
const MAX_REVEAL_CHARS_PER_SIDE = 2;
const TRANSCRIPT_HUMAN_FINGERPRINT_KEY_BYTES = 32;

/** Stable SHA-256 fingerprint for correlating repeated findings locally. */
export function fingerprintSecretValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Ephemeral per-report key for salting fingerprint digests in human transcript output. */
export function createTranscriptReportFingerprintKey(): Buffer {
  return randomBytes(TRANSCRIPT_HUMAN_FINGERPRINT_KEY_BYTES);
}

/** Keyed display fingerprint for human transcript reports; not a reusable raw digest. */
export function formatTranscriptHumanFingerprint(
  valueFingerprint: string,
  reportKey: Buffer,
): string {
  return createHmac("sha256", reportKey).update(valueFingerprint, "utf8").digest("hex");
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

  const revealPerSide = length <= 8 ? 1 : MAX_REVEAL_CHARS_PER_SIDE;
  const prefix = value.slice(0, revealPerSide);
  const suffix = value.slice(-revealPerSide);
  return `${prefix}…${suffix} (${String(length)} chars)`;
}

/** Minimum length for exact-match candidate comparison. */
export function isComparableCandidateValue(value: string): boolean {
  return value.length >= MIN_FINGERPRINT_LENGTH;
}
