import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  buildBackupExportArtifactKey,
  buildBackupExportEvidenceKey,
} from "./artifact-refs.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";
import type { BackupExportSuccessEvidence } from "./types.js";

/** A read of the latest-export pointer plus the opaque storage version (R2 etag) it carried. */
export interface LatestEvidenceSnapshot {
  readonly body: string;
  readonly version: string;
}

export interface BackupExportStorage {
  putArtifact(key: string, body: Uint8Array): Promise<void>;
  putEvidence(key: string, body: string): Promise<void>;
  /**
   * Compare-and-swap on the latest-export pointer: writes only while the stored object still
   * matches `expected` (null means the pointer must not exist yet) and returns false on conflict,
   * so the publisher's recency guard cannot be raced into regressing the pointer.
   */
  putLatestEvidence(body: string, expected: LatestEvidenceSnapshot | null): Promise<boolean>;
  getArtifact(key: string): Promise<Uint8Array | null>;
  getEvidence(key: string): Promise<string | null>;
  getLatestEvidence(): Promise<LatestEvidenceSnapshot | null>;
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

  putLatestEvidence(body: string, expected: LatestEvidenceSnapshot | null): Promise<boolean> {
    const current = this.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    const currentVersion = typeof current === "string" ? current : null;
    if ((expected?.version ?? null) !== currentVersion) {
      return Promise.resolve(false);
    }
    this.objects.set(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, body);
    return Promise.resolve(true);
  }

  getArtifact(key: string): Promise<Uint8Array | null> {
    const value = this.objects.get(key);
    return Promise.resolve(value instanceof Uint8Array ? value : null);
  }

  getEvidence(key: string): Promise<string | null> {
    const value = this.objects.get(key);
    return Promise.resolve(typeof value === "string" ? value : null);
  }

  // The in-memory "etag" is the stored body itself: content-addressed like R2's, and stable
  // across tests that seed `objects` directly.
  async getLatestEvidence(): Promise<LatestEvidenceSnapshot | null> {
    const body = await this.getEvidence(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
    return body === null ? null : { body, version: body };
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
