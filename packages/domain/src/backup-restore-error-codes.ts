/**
 * Sealed backup restore-import failures (ADR-0084). `notArmed` and `targetNotFresh` carry the
 * ADR-0084 `restore_not_armed` / `restore_target_not_fresh` fail-closed semantics under the
 * repo-wide `domain.reason` dotted-code convention.
 */
export const BACKUP_RESTORE_ERROR_CODES = {
  notArmed: "backup_restore.not_armed",
  targetIsLive: "backup_restore.target_is_live",
  targetNotFresh: "backup_restore.target_not_fresh",
  importConflict: "backup_restore.import_conflict",
  artifactNotFound: "backup_restore.artifact_not_found",
  artifactInvalid: "backup_restore.artifact_invalid",
  headerMismatch: "backup_restore.header_mismatch",
  exportOperationMismatch: "backup_restore.export_operation_mismatch",
  manifestIncomplete: "backup_restore.manifest_incomplete",
  unsupportedTable: "backup_restore.unsupported_table",
  schemaMismatch: "backup_restore.schema_mismatch",
  importFailed: "backup_restore.import_failed",
} as const;

export type BackupRestoreErrorCode =
  (typeof BACKUP_RESTORE_ERROR_CODES)[keyof typeof BACKUP_RESTORE_ERROR_CODES];
