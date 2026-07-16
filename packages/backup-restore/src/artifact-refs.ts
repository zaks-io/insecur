import { isMetadataSafeOpaqueTokenString } from "@insecur/domain";

/** Legacy R2 key for consumers that have not yet moved to evidence.artifact_ref. */
export const BACKUP_LATEST_EXPORT_ARTIFACT_KEY = "backup/latest-export.ibkp" as const;

/** R2 key for the atomically advanced latest-export evidence pointer. */
export const BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY = "backup/export-success.json" as const;

function assertBackupExportIdentity(exportIdentity: string): void {
  if (!isMetadataSafeOpaqueTokenString(exportIdentity)) {
    throw new Error("backup export identity must be a metadata-safe opaque token");
  }
}

export function buildBackupExportArtifactKey(exportIdentity: string): string {
  assertBackupExportIdentity(exportIdentity);
  return `backup/exports/${exportIdentity}/artifact.ibkp`;
}

export function buildBackupExportEvidenceKey(exportIdentity: string): string {
  assertBackupExportIdentity(exportIdentity);
  return `backup/exports/${exportIdentity}/export-success.json`;
}

const ARTIFACT_KEY_PATTERN = /^backup\/exports\/([^/]+)\/artifact\.ibkp$/;

/** Recover the export identity from an immutable artifact key, or null for foreign shapes. */
export function parseBackupExportArtifactKey(artifactRef: string): string | null {
  const match = ARTIFACT_KEY_PATTERN.exec(artifactRef);
  const exportIdentity = match?.[1];
  if (exportIdentity === undefined || !isMetadataSafeOpaqueTokenString(exportIdentity)) {
    return null;
  }
  return exportIdentity;
}
