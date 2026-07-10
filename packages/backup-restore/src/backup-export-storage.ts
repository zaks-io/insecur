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
  getArtifact(key: string): Promise<Uint8Array | null>;
  getEvidence(key: string): Promise<string | null>;
  getLatestEvidence(): Promise<string | null>;
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

  getArtifact(key: string): Promise<Uint8Array | null> {
    const value = this.objects.get(key);
    return Promise.resolve(value instanceof Uint8Array ? value : null);
  }

  getEvidence(key: string): Promise<string | null> {
    const value = this.objects.get(key);
    return Promise.resolve(typeof value === "string" ? value : null);
  }

  getLatestEvidence(): Promise<string | null> {
    return this.getEvidence(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
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

export function serializeExportEvidence(evidence: BackupExportSuccessEvidence): string {
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
