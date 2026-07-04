import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openBackupArtifact, sealBackupArtifact } from "../src/backup-envelope.js";
import { validateBackupEncryptionConfig } from "../src/backup-encryption-config.js";
import { BACKUP_EXPORT_FORMAT_MARKER } from "../src/constants.js";

function durableRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = index + 1;
  }
  return root;
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
});
