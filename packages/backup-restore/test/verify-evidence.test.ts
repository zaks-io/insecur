import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyBackupRestoreEvidence } from "../src/verify-evidence.js";

function writeEvidence(evidenceDir: string, relativePath: string, payload: string): void {
  const absolutePath = join(evidenceDir, relativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, payload, "utf8");
}

describe("verifyBackupRestoreEvidence", () => {
  it("returns missing evidence for partial restore-drill JSON without throwing", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-verify-"));
    writeEvidence(
      evidenceDir,
      "backup/restore-drill.json",
      JSON.stringify({
        status: "passed",
        encryption_verified: true,
      }),
    );

    const result = verifyBackupRestoreEvidence({ evidenceDir });
    expect(result.restoreDrill.status).toBe("missing_evidence");
    expect(result.ok).toBe(false);
  });

  it("returns missing evidence for malformed restore-drill JSON without throwing", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-verify-"));
    writeEvidence(evidenceDir, "backup/restore-drill.json", "{not-json");

    const result = verifyBackupRestoreEvidence({ evidenceDir });
    expect(result.restoreDrill.status).toBe("missing_evidence");
    expect(result.ok).toBe(false);
  });
});
