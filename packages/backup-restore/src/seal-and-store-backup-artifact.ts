import type { OperationId } from "@insecur/domain";

import { buildBackupExportArtifactKey } from "./artifact-refs.js";
import { validateBackupEncryptionConfig } from "./backup-encryption-config.js";
import { openBackupArtifact, sealBackupArtifact } from "./backup-envelope.js";
import {
  writeBackupExportArtifact,
  writeBackupExportEvidence,
  type BackupExportStorage,
} from "./backup-export-storage.js";
import type { OnBackupExportStepCompleted } from "./backup-export-step.js";
import { buildExportSuccessEvidence } from "./build-export-success-evidence.js";
import { hashBackupArtifact } from "./hash-backup-artifact.js";
import type { BackupExportOrganizationSnapshot, BackupExportSuccessEvidence } from "./types.js";

export interface SealAndStoreBackupArtifactInput {
  exportIdentity: string;
  instanceId: string;
  exportTimestamp: string;
  instanceSnapshotAt: string;
  rootKeyBytes: Uint8Array;
  rootKeyVersion: number;
  organizationSnapshots: BackupExportOrganizationSnapshot[];
  jsonlPayload: Uint8Array;
  storage: BackupExportStorage;
  operationId: OperationId;
  onStepCompleted?: OnBackupExportStepCompleted;
}

/**
 * Seals the export payload, then writes the immutable per-run artifact and evidence objects
 * (ADR-0072). The latest pointer is intentionally not advanced here — that only happens once the
 * audit event and Operation success are also durable (see run-backup-export.ts).
 */
export async function sealAndStoreBackupArtifact(
  input: SealAndStoreBackupArtifactInput,
): Promise<BackupExportSuccessEvidence> {
  const sealedArtifact = await sealBackupArtifact({
    instanceId: input.instanceId,
    exportTimestamp: input.exportTimestamp,
    instanceSnapshotAt: input.instanceSnapshotAt,
    rootKeyBytes: input.rootKeyBytes,
    rootKeyVersion: input.rootKeyVersion,
    jsonlPayload: input.jsonlPayload,
    organizationSnapshots: input.organizationSnapshots,
  });
  const artifactRef = buildBackupExportArtifactKey(input.exportIdentity);
  const artifactHash = await hashBackupArtifact(sealedArtifact);

  const opened = await openBackupArtifact({
    instanceId: input.instanceId,
    rootKeyBytes: input.rootKeyBytes,
    sealedBytes: sealedArtifact,
  });
  const encryptionCheck = validateBackupEncryptionConfig(opened.header, input.exportTimestamp);
  const exportEvidence = buildExportSuccessEvidence({
    instanceId: input.instanceId,
    exportTimestamp: input.exportTimestamp,
    rootKeyVersion: input.rootKeyVersion,
    organizationCount: input.organizationSnapshots.length,
    operationId: input.operationId,
    artifactRef,
    artifactHash,
    encryptionVerified: encryptionCheck.status === "passed",
  });

  const storageInput = {
    exportIdentity: input.exportIdentity,
    sealedArtifact,
    exportEvidence,
  };
  await writeBackupExportArtifact(input.storage, storageInput);
  await input.onStepCompleted?.("artifact_stored");
  await writeBackupExportEvidence(input.storage, storageInput);
  await input.onStepCompleted?.("evidence_stored");
  return exportEvidence;
}
