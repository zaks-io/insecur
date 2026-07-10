import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { backupRestoreEvidenceDocs, runBackupFixtureSelfTest } from "../src/index.js";

function drillEvidenceDir(): string {
  return mkdtempSync(join(tmpdir(), "backup-drill-"));
}

describe("runBackupFixtureSelfTest", () => {
  it("tests the backup envelope without emitting launch-grade evidence", async () => {
    const evidenceDir = drillEvidenceDir();
    const startedAt = new Date("2026-07-08T00:00:00.000Z");
    const result = await runBackupFixtureSelfTest({
      evidenceDir,
      instanceId: "inst_drill_test",
      startedAt,
    });

    expect(result.evidence).toMatchObject({
      status: "passed",
      fixture_only: true,
      encryption_verified: true,
      canary_verified: true,
    });

    // A sealed artifact is written to disk.
    const sealed = readFileSync(result.artifactPath);
    expect(sealed.byteLength).toBeGreaterThan(0);

    const fixtureJson = JSON.parse(
      readFileSync(join(evidenceDir, "backup/fixture-self-test.json"), "utf8"),
    );
    expect(fixtureJson.fixture_only).toBe(true);
    expect(() => readFileSync(join(evidenceDir, "backup/export-success.json"))).toThrow();
    expect(() => readFileSync(join(evidenceDir, "backup/restore-drill.json"))).toThrow();
  });

  it("uses an ephemeral random fixture key by default", async () => {
    const result = await runBackupFixtureSelfTest({ evidenceDir: drillEvidenceDir() });
    expect(result.evidence.status).toBe("passed");
    expect(readFileSync(result.artifactPath).byteLength).toBeGreaterThan(0);
  });

  it("lists the backup evidence docs the drill produces", () => {
    const docs = backupRestoreEvidenceDocs();
    expect(docs).toContain("docs/adr/0058-minimal-backup-and-tested-restore.md");
    expect(docs.some((doc) => doc.includes("0072"))).toBe(true);
  });
});
