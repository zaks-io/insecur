import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  backupRestoreEvidenceDocs,
  openBackupArtifact,
  parseBackupJsonlPayload,
  runLocalRestoreDrill,
} from "../src/index.js";

function drillEvidenceDir(): string {
  return mkdtempSync(join(tmpdir(), "backup-drill-"));
}

describe("runLocalRestoreDrill", () => {
  it("seals, restores, and verifies the recovery canary end to end in memory", async () => {
    const evidenceDir = drillEvidenceDir();
    const startedAt = new Date("2026-07-08T00:00:00.000Z");
    const completedAt = new Date("2026-07-08T00:05:00.000Z");

    const result = await runLocalRestoreDrill({
      evidenceDir,
      instanceId: "inst_drill_test",
      actor: "test:drill",
      startedAt,
      completedAt,
      restoreTargetRef: "neon-branch://drill-target",
    });

    expect(result.exportEvidence.status).toBe("passed");
    expect(result.exportEvidence.encryption_verified).toBe(true);
    expect(result.drillEvidence.status).toBe("passed");
    expect(result.drillEvidence.canary_verification.status).toBe("passed");
    expect(result.drillEvidence.rto.duration_seconds).toBe(300);
    expect(result.drillEvidence.restore_target_ref).toBe("neon-branch://drill-target");

    // A sealed artifact is written to disk.
    const sealed = readFileSync(result.artifactPath);
    expect(sealed.byteLength).toBeGreaterThan(0);

    // Evidence files are written and are metadata-safe JSON.
    const exportJson = JSON.parse(
      readFileSync(join(evidenceDir, "backup/export-success.json"), "utf8"),
    );
    expect(exportJson.encryption_verified).toBe(true);
    const drillJson = JSON.parse(
      readFileSync(join(evidenceDir, "backup/restore-drill.json"), "utf8"),
    );
    expect(drillJson.canary_verification.variable_key).toBe("INSECUR_RECOVERY_CANARY");
  });

  it("defaults instance, actor, and root key when omitted", async () => {
    const result = await runLocalRestoreDrill({ evidenceDir: drillEvidenceDir() });
    expect(result.exportEvidence.instance_id).toBe("inst_local_restore_drill");
    expect(result.drillEvidence.actor).toBe("ci:backup-restore-drill");
    expect(result.drillEvidence.status).toBe("passed");

    const sealed = readFileSync(result.artifactPath);
    const opened = await openBackupArtifact({
      instanceId: "inst_local_restore_drill",
      // Reproduce the drill's synthetic key so the restored payload carries the canary row.
      rootKeyBytes: synthDrillKey(),
      sealedBytes: sealed,
    });
    const rows = parseBackupJsonlPayload(opened.jsonlPayload);
    expect(rows.length).toBe(1);
  });

  it("lists the backup evidence docs the drill produces", () => {
    const docs = backupRestoreEvidenceDocs();
    expect(docs).toContain("docs/adr/0058-minimal-backup-and-tested-restore.md");
    expect(docs.some((doc) => doc.includes("0072"))).toBe(true);
  });
});

function synthDrillKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = (index * 7 + 11) % 256;
  }
  return root;
}
