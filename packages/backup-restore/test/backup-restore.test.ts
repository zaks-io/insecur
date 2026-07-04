import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { concatBytes } from "@insecur/crypto";
import { describe, expect, it } from "vitest";

import { openBackupArtifact, sealBackupArtifact } from "../src/backup-envelope.js";
import { validateBackupEncryptionConfig } from "../src/backup-encryption-config.js";
import { BACKUP_EXPORT_FORMAT_MARKER } from "../src/constants.js";
import type { BackupExportHeader } from "../src/types.js";
import {
  buildRecoveryCanaryExportRow,
  findRecoveryCanaryRow,
  verifyRecoveryCanaryFromCiphertext,
} from "../src/recovery-canary.js";
import {
  computeExportExpiresAt,
  evaluateExportFreshnessEvidence,
  evaluateRestoreDrillEvidence,
} from "../src/evaluate-readiness.js";
import { verifyBackupRestoreEvidence } from "../src/verify-evidence.js";

function durableRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = index + 1;
  }
  return root;
}

function tamperBackupHeader(
  sealed: Uint8Array,
  mutate: (header: BackupExportHeader) => void,
): Uint8Array {
  const headerLength = new DataView(sealed.buffer, sealed.byteOffset + 4, 4).getUint32(0, false);
  const headerStart = 8;
  const headerEnd = headerStart + headerLength;
  const header = JSON.parse(
    new TextDecoder().decode(sealed.subarray(headerStart, headerEnd)),
  ) as BackupExportHeader;
  mutate(header);
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const headerLengthBytes = new Uint8Array(4);
  new DataView(headerLengthBytes.buffer).setUint32(0, headerBytes.byteLength, false);
  const payloadBytes = sealed.subarray(headerEnd);
  return concatBytes(sealed.subarray(0, 4), headerLengthBytes, headerBytes, payloadBytes);
}

describe("backup envelope", () => {
  it("seals and opens a JSONL payload with valid encryption metadata", async () => {
    const rootKeyBytes = durableRootKey();
    const instanceId = "inst_test_backup";
    const exportTimestamp = "2026-07-04T00:00:00.000Z";
    const jsonlPayload = new TextEncoder().encode(
      '{"table":"organizations","organization_id":"org_test"}\n',
    );
    const sealed = await sealBackupArtifact({
      instanceId,
      exportTimestamp,
      rootKeyBytes,
      jsonlPayload,
      organizationSnapshots: [{ organization_id: "org_test", snapshot_at: exportTimestamp }],
    });

    const opened = await openBackupArtifact({ instanceId, rootKeyBytes, sealedBytes: sealed });
    expect(new TextDecoder().decode(opened.jsonlPayload)).toBe(
      new TextDecoder().decode(jsonlPayload),
    );
    expect(opened.header.format_marker).toBe(BACKUP_EXPORT_FORMAT_MARKER);
  });

  it("fails encryption config check when required header fields are missing", () => {
    const check = validateBackupEncryptionConfig(
      {
        format_marker: "wrong",
        instance_id: "",
        export_timestamp: "",
        root_key_version: 0,
        dek_iv: "",
        wrapped_dek: "",
        payload_iv: "",
        organization_snapshots: [],
      },
      "2026-07-04T00:00:00.000Z",
    );

    expect(check.status).toBe("failed");
    expect(check.missing_fields.length).toBeGreaterThan(0);
  });

  it("rejects opening with the wrong root key", async () => {
    const rootKeyBytes = durableRootKey();
    const wrongKey = new Uint8Array(32);
    crypto.getRandomValues(wrongKey);
    const sealed = await sealBackupArtifact({
      instanceId: "inst_wrong_key",
      exportTimestamp: "2026-07-04T00:00:00.000Z",
      rootKeyBytes,
      jsonlPayload: new TextEncoder().encode("{}\n"),
      organizationSnapshots: [
        { organization_id: "org_test", snapshot_at: "2026-07-04T00:00:00.000Z" },
      ],
    });

    await expect(
      openBackupArtifact({
        instanceId: "inst_wrong_key",
        rootKeyBytes: wrongKey,
        sealedBytes: sealed,
      }),
    ).rejects.toThrow();
  });

  it("rejects tampered root key version metadata in the backup header", async () => {
    const rootKeyBytes = durableRootKey();
    const instanceId = "inst_tamper_root_key_version";
    const sealed = await sealBackupArtifact({
      instanceId,
      exportTimestamp: "2026-07-04T00:00:00.000Z",
      rootKeyBytes,
      jsonlPayload: new TextEncoder().encode("{}\n"),
      organizationSnapshots: [
        { organization_id: "org_test", snapshot_at: "2026-07-04T00:00:00.000Z" },
      ],
    });
    const tampered = tamperBackupHeader(sealed, (header) => {
      header.root_key_version = header.root_key_version + 1;
    });

    await expect(
      openBackupArtifact({ instanceId, rootKeyBytes, sealedBytes: tampered }),
    ).rejects.toThrow();
  });

  it("rejects tampered organization snapshot metadata in the backup header", async () => {
    const rootKeyBytes = durableRootKey();
    const instanceId = "inst_tamper_org_snapshots";
    const sealed = await sealBackupArtifact({
      instanceId,
      exportTimestamp: "2026-07-04T00:00:00.000Z",
      rootKeyBytes,
      jsonlPayload: new TextEncoder().encode("{}\n"),
      organizationSnapshots: [
        { organization_id: "org_test", snapshot_at: "2026-07-04T00:00:00.000Z" },
      ],
    });
    const tampered = tamperBackupHeader(sealed, (header) => {
      header.organization_snapshots = [
        { organization_id: "org_forged", snapshot_at: "2026-07-04T00:00:00.000Z" },
      ];
    });

    await expect(
      openBackupArtifact({ instanceId, rootKeyBytes, sealedBytes: tampered }),
    ).rejects.toThrow();
  });
});

describe("recovery canary scope", () => {
  it("rejects rows with mismatched tenant scope metadata", async () => {
    const rootKeyBytes = durableRootKey();
    const row = await buildRecoveryCanaryExportRow(rootKeyBytes);
    const mismatchedRow = { ...row, organization_id: "org_wrong_scope" };
    const jsonlPayload = new TextEncoder().encode(`${JSON.stringify(mismatchedRow)}\n`);

    expect(findRecoveryCanaryRow(jsonlPayload)).toBeNull();

    const verification = await verifyRecoveryCanaryFromCiphertext({
      rootKeyBytes,
      row: mismatchedRow,
      checkedAt: "2026-07-04T00:00:00.000Z",
      instanceId: "inst_scope_mismatch",
    });
    expect(verification.status).toBe("failed");
  });
});

describe("runLocalRestoreDrill", () => {
  it("writes metadata-only evidence without secret material keys", async () => {
    const { runLocalRestoreDrill } = await import("../src/run-local-drill.js");
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-restore-"));
    const result = await runLocalRestoreDrill({ evidenceDir });

    expect(result.drillEvidence.status).toBe("passed");
    expect(result.exportEvidence.encryption_verified).toBe(true);
    expect(result.drillEvidence.canary_verification.status).toBe("passed");

    const drillJson = readFileSync(join(evidenceDir, "backup/restore-drill.json"), "utf8");
    expect(drillJson).not.toMatch(/"secret"/i);
    expect(drillJson).not.toMatch(/"plaintext"/i);
    expect(drillJson).not.toMatch(/insecur-recovery-canary-v1-sentinel/);
  });

  it("keeps export freshness policy aligned when drill duration is non-zero", async () => {
    const { runLocalRestoreDrill } = await import("../src/run-local-drill.js");
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-restore-duration-"));
    const startedAt = new Date("2026-07-04T00:00:00.000Z");
    const completedAt = new Date("2026-07-04T00:00:10.000Z");

    const result = await runLocalRestoreDrill({
      evidenceDir,
      startedAt,
      completedAt,
    });

    expect(result.exportEvidence.expires_at).toBe(
      computeExportExpiresAt(result.exportEvidence.export_timestamp),
    );
    expect(result.drillEvidence.rto.duration_seconds).toBe(10);

    const exportFresh = evaluateExportFreshnessEvidence(result.exportEvidence, completedAt);
    expect(exportFresh.status).toBe("passed");

    const restoreDrill = evaluateRestoreDrillEvidence(result.drillEvidence, completedAt);
    expect(restoreDrill.status).toBe("passed");

    const verified = verifyBackupRestoreEvidence({ evidenceDir, now: completedAt });
    expect(verified.ok).toBe(true);
  });

  it("aligns drill duration_seconds with floor-based RTO validation", async () => {
    const { runLocalRestoreDrill } = await import("../src/run-local-drill.js");
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-restore-rto-floor-"));
    const startedAt = new Date("2026-07-04T00:00:00.000Z");
    const completedAt = new Date("2026-07-04T00:00:05.600Z");

    const result = await runLocalRestoreDrill({
      evidenceDir,
      startedAt,
      completedAt,
    });

    expect(result.drillEvidence.rto.duration_seconds).toBe(5);
    expect(evaluateRestoreDrillEvidence(result.drillEvidence, completedAt).status).toBe("passed");

    const verified = verifyBackupRestoreEvidence({ evidenceDir, now: completedAt });
    expect(verified.ok).toBe(true);
  });
});
