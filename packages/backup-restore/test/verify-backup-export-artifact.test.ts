import { describe, expect, it } from "vitest";

import { buildBackupExportArtifactKey } from "../src/artifact-refs.js";
import { hashBackupArtifact } from "../src/hash-backup-artifact.js";
import type { BackupExportSuccessEvidence } from "../src/types.js";
import { verifyBackupExportArtifact } from "../src/verify-backup-export-artifact.js";

const EXPORT_IDENTITY = "backup.export.2026-07-08T03.00.00.000Z";
const ARTIFACT_REF = buildBackupExportArtifactKey(EXPORT_IDENTITY);

async function evidenceFor(sealedArtifact: Uint8Array): Promise<BackupExportSuccessEvidence> {
  return {
    status: "passed",
    checked_at: "2026-07-08T03:00:00.000Z",
    instance_id: "inst_1",
    export_timestamp: "2026-07-08T03:00:00.000Z",
    root_key_version: 1,
    organization_count: 2,
    artifact_ref: ARTIFACT_REF,
    artifact_sha256: await hashBackupArtifact(sealedArtifact),
    encryption_verified: true,
    expires_at: "2026-07-09T03:00:00.000Z",
    operation_id: "op_00000000000000000000000001",
  };
}

describe("verifyBackupExportArtifact", () => {
  it("accepts sealed bytes that match the evidence reference and hash", async () => {
    const sealedArtifact = new Uint8Array([1, 2, 3, 4]);

    expect(
      await verifyBackupExportArtifact({
        evidence: await evidenceFor(sealedArtifact),
        artifactRef: ARTIFACT_REF,
        sealedArtifact,
      }),
    ).toBe(true);
  });

  it("rejects a claimed reference for another artifact", async () => {
    const sealedArtifact = new Uint8Array([1, 2, 3, 4]);

    expect(
      await verifyBackupExportArtifact({
        evidence: await evidenceFor(sealedArtifact),
        artifactRef: buildBackupExportArtifactKey("backup.export.2026-07-08T04.00.00.000Z"),
        sealedArtifact,
      }),
    ).toBe(false);
  });

  it("rejects bytes whose hash does not match the evidence", async () => {
    const evidence = await evidenceFor(new Uint8Array([1, 2, 3, 4]));

    expect(
      await verifyBackupExportArtifact({
        evidence,
        artifactRef: ARTIFACT_REF,
        sealedArtifact: new Uint8Array([1, 2, 3, 5]),
      }),
    ).toBe(false);
  });
});
