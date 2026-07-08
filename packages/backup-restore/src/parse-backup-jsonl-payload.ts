import type { BackupExportRow } from "./serialize-backup-row.js";

export function parseBackupJsonlPayload(payload: Uint8Array): BackupExportRow[] {
  const text = new TextDecoder().decode(payload);
  if (!text.trim()) {
    return [];
  }

  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as BackupExportRow);
}
