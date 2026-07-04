import { assertMetadataSafe, findMetadataSafetyViolations } from "@insecur/domain";

const BACKUP_RESTORE_EXTRA_FORBIDDEN_KEYS = ["plaintext", "ciphertext"] as const;

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
