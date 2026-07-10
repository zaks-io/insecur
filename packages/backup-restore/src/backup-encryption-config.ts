import { BACKUP_EXPORT_FORMAT_MARKER } from "./constants.js";
import type { BackupExportHeader, BackupEncryptionConfigCheck } from "./types.js";

type HeaderFieldCheck = readonly [failed: boolean, field: string];

function failedHeaderChecks(header: BackupExportHeader): HeaderFieldCheck[] {
  return [
    [header.format_marker !== BACKUP_EXPORT_FORMAT_MARKER, "format_marker"],
    [!header.instance_id, "instance_id"],
    [!header.export_timestamp, "export_timestamp"],
    [!header.instance_snapshot_at, "instance_snapshot_at"],
    [
      typeof header.root_key_version !== "number" || header.root_key_version < 1,
      "root_key_version",
    ],
    [!header.dek_iv, "dek_iv"],
    [!header.wrapped_dek, "wrapped_dek"],
    [!header.payload_iv, "payload_iv"],
    [
      !Array.isArray(header.organization_snapshots) || header.organization_snapshots.length === 0,
      "organization_snapshots",
    ],
  ];
}

export function collectMissingBackupHeaderFields(header: BackupExportHeader): string[] {
  return failedHeaderChecks(header)
    .filter(([failed]) => failed)
    .map(([, field]) => field);
}

export function validateBackupEncryptionConfig(
  header: BackupExportHeader,
  checkedAt: string,
): BackupEncryptionConfigCheck {
  const missingFields = collectMissingBackupHeaderFields(header);

  return {
    status: missingFields.length === 0 ? "passed" : "failed",
    checked_at: checkedAt,
    instance_id: header.instance_id,
    root_key_version: typeof header.root_key_version === "number" ? header.root_key_version : null,
    format_marker: typeof header.format_marker === "string" ? header.format_marker : null,
    missing_fields: missingFields,
  };
}
