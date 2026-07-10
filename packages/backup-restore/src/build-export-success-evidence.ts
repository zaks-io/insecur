import { computeExportExpiresAt } from "./evaluate-readiness.js";
import type { BackupExportSuccessEvidence } from "./types.js";

/** Metadata-only success evidence for one export run (ADR-0072). */
export function buildExportSuccessEvidence(input: {
  instanceId: string;
  exportTimestamp: string;
  rootKeyVersion: number;
  organizationCount: number;
  operationId: string;
  artifactRef: string;
  artifactHash: string;
  encryptionVerified: boolean;
}): BackupExportSuccessEvidence {
  return {
    status: input.encryptionVerified ? "passed" : "failed",
    checked_at: input.exportTimestamp,
    instance_id: input.instanceId,
    export_timestamp: input.exportTimestamp,
    root_key_version: input.rootKeyVersion,
    organization_count: input.organizationCount,
    artifact_ref: input.artifactRef,
    artifact_sha256: input.artifactHash,
    encryption_verified: input.encryptionVerified,
    expires_at: computeExportExpiresAt(input.exportTimestamp),
    operation_id: input.operationId,
  };
}
