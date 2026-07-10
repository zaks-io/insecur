import { hashBackupArtifact } from "./hash-backup-artifact.js";
import type { BackupExportSuccessEvidence } from "./types.js";

/** Verifies fetched sealed bytes against the immutable artifact reference in export evidence. */
export async function verifyBackupExportArtifact(input: {
  evidence: BackupExportSuccessEvidence;
  artifactRef: string;
  sealedArtifact: Uint8Array;
}): Promise<boolean> {
  if (input.evidence.artifact_ref !== input.artifactRef) {
    return false;
  }

  return input.evidence.artifact_sha256 === (await hashBackupArtifact(input.sealedArtifact));
}
