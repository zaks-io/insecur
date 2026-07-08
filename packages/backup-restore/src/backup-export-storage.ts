import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  BACKUP_LATEST_EXPORT_ARTIFACT_KEY,
} from "./artifact-refs.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";
import type { BackupExportSuccessEvidence } from "./types.js";

export interface BackupExportStorage {
  putArtifact(key: string, body: Uint8Array): Promise<void>;
  putEvidence(key: string, body: string): Promise<void>;
}

export class MemoryBackupExportStorage implements BackupExportStorage {
  readonly objects = new Map<string, Uint8Array | string>();

  putArtifact(key: string, body: Uint8Array): Promise<void> {
    this.objects.set(key, body);
    return Promise.resolve();
  }

  putEvidence(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
    return Promise.resolve();
  }
}

export async function writeBackupExportArtifacts(
  storage: BackupExportStorage,
  input: {
    sealedArtifact: Uint8Array;
    exportEvidence: BackupExportSuccessEvidence;
  },
): Promise<void> {
  assertBackupRestoreEvidenceIsMetadataSafe(input.exportEvidence);
  await storage.putArtifact(BACKUP_LATEST_EXPORT_ARTIFACT_KEY, input.sealedArtifact);
  await storage.putEvidence(
    BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
    `${JSON.stringify(input.exportEvidence, null, 2)}\n`,
  );
}
