import { BACKUP_RESTORE_ERROR_CODES, type BackupRestoreErrorCode } from "@insecur/domain";

export { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";
export type { BackupRestoreErrorCode } from "@insecur/domain";

/**
 * Fail-closed restore-import failure (ADR-0084). Messages are fixed metadata-only strings chosen
 * at the throw site — never interpolated row data, ciphertext, or driver error detail — because
 * the code and message cross the restore RPC seam into operator-facing output.
 */
export class RestoreImportError extends Error {
  readonly code: BackupRestoreErrorCode;
  readonly retryable = false;

  constructor(code: BackupRestoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RestoreImportError";
    this.code = code;
  }
}

export function isRestoreImportError(error: unknown): error is RestoreImportError {
  return error instanceof RestoreImportError;
}

/** ADR-0084 `restore_not_armed`: the RESTORE_DB binding is absent on this deploy. */
export function restoreNotArmedError(): RestoreImportError {
  return new RestoreImportError(
    BACKUP_RESTORE_ERROR_CODES.notArmed,
    "restore is not armed: the RESTORE_DB binding is absent",
  );
}
