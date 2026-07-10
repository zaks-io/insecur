import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  buildBackupExportArtifactKey,
  buildBackupExportEvidenceKey,
} from "./artifact-refs.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";
import type { BackupExportSuccessEvidence } from "./types.js";

export interface BackupExportStorage {
  putArtifact(key: string, body: Uint8Array): Promise<void>;
  putEvidence(key: string, body: string): Promise<void>;
  putLatestEvidence(body: string): Promise<void>;
}

export class MemoryBackupExportStorage implements BackupExportStorage {
  readonly objects = new Map<string, Uint8Array | string>();

  putArtifact(key: string, body: Uint8Array): Promise<void> {
    if (this.objects.has(key)) {
      return Promise.reject(new Error(`immutable backup artifact already exists at ${key}`));
    }
    this.objects.set(key, body);
    return Promise.resolve();
  }

  putEvidence(key: string, body: string): Promise<void> {
    if (this.objects.has(key)) {
      return Promise.reject(new Error(`immutable backup evidence already exists at ${key}`));
    }
    this.objects.set(key, body);
    return Promise.resolve();
  }

  putLatestEvidence(body: string): Promise<void> {
    this.objects.set(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, body);
    return Promise.resolve();
  }
}

interface WriteBackupExportArtifactsInput {
  exportIdentity: string;
  sealedArtifact: Uint8Array;
  exportEvidence: BackupExportSuccessEvidence;
}

function assertExportEvidenceMatchesIdentity(input: WriteBackupExportArtifactsInput): void {
  assertBackupRestoreEvidenceIsMetadataSafe(input.exportEvidence);
  if (input.exportEvidence.artifact_ref !== buildBackupExportArtifactKey(input.exportIdentity)) {
    throw new Error("backup export evidence artifact_ref must match its immutable export identity");
  }
}

function serializeExportEvidence(evidence: BackupExportSuccessEvidence): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export async function writeBackupExportArtifact(
  storage: BackupExportStorage,
  input: WriteBackupExportArtifactsInput,
): Promise<void> {
  assertExportEvidenceMatchesIdentity(input);
  await storage.putArtifact(
    buildBackupExportArtifactKey(input.exportIdentity),
    input.sealedArtifact,
  );
}

export async function writeBackupExportEvidence(
  storage: BackupExportStorage,
  input: WriteBackupExportArtifactsInput,
): Promise<void> {
  assertExportEvidenceMatchesIdentity(input);
  await storage.putEvidence(
    buildBackupExportEvidenceKey(input.exportIdentity),
    serializeExportEvidence(input.exportEvidence),
  );
}

export async function writeBackupExportArtifacts(
  storage: BackupExportStorage,
  input: WriteBackupExportArtifactsInput,
): Promise<void> {
  await writeBackupExportArtifact(storage, input);
  await writeBackupExportEvidence(storage, input);
}

export async function publishLatestBackupExport(
  storage: BackupExportStorage,
  exportEvidence: BackupExportSuccessEvidence,
): Promise<void> {
  assertBackupRestoreEvidenceIsMetadataSafe(exportEvidence);
  await storage.putLatestEvidence(serializeExportEvidence(exportEvidence));
}
