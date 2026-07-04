import { assertMetadataSafe, findMetadataSafetyViolations } from "@insecur/domain";

/** Generic reveal keys plus backup-package sealed export / key-material field names. */
const BACKUP_RESTORE_EXTRA_FORBIDDEN_KEYS = [
  "plaintext",
  "ciphertext",
  "ciphertext_b64url",
  "wrapped_dek",
  "dek_iv",
  "payload_iv",
  "payload",
  "payload_bytes",
  "body",
  "body_bytes",
  "sealed_bytes",
  "jsonl_payload",
  "encrypted_payload",
] as const;

const BACKUP_RESTORE_EXTRA_PATTERNS = [/insecur-recovery-canary-v1-sentinel/] as const;

export function findBackupRestoreEvidenceViolations(value: unknown): string[] {
  return findMetadataSafetyViolations(value, {
    extraForbiddenKeys: BACKUP_RESTORE_EXTRA_FORBIDDEN_KEYS,
    extraSensitivePatterns: BACKUP_RESTORE_EXTRA_PATTERNS,
  });
}

export function isBackupRestoreEvidenceMetadataSafe(value: unknown): boolean {
  return findBackupRestoreEvidenceViolations(value).length === 0;
}

export function assertBackupRestoreEvidenceIsMetadataSafe(value: unknown): void {
  assertMetadataSafe(value, {
    extraForbiddenKeys: BACKUP_RESTORE_EXTRA_FORBIDDEN_KEYS,
    extraSensitivePatterns: BACKUP_RESTORE_EXTRA_PATTERNS,
  });
}

export function parseMetadataSafeBackupRestoreEvidence<T>(
  raw: unknown,
  parser: (value: unknown) => T | null,
): T | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!isBackupRestoreEvidenceMetadataSafe(raw)) {
    return null;
  }
  return parser(raw);
}
