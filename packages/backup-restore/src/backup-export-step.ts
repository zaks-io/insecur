export type BackupExportStep =
  "artifact_stored" | "evidence_stored" | "audit_recorded" | "operation_succeeded";

export type OnBackupExportStepCompleted = (step: BackupExportStep) => void | Promise<void>;
