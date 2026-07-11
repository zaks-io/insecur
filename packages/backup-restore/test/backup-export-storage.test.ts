import { describe, expect, it } from "vitest";

import { BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY } from "../src/artifact-refs.js";
import { MemoryBackupExportStorage } from "../src/backup-export-storage.js";

describe("MemoryBackupExportStorage.putLatestEvidence compare-and-swap", () => {
  it("returns null from getLatestEvidence before anything has been published", async () => {
    const storage = new MemoryBackupExportStorage();
    await expect(storage.getLatestEvidence()).resolves.toBeNull();
  });

  it("accepts a first publish guarded by expected: null when no pointer exists yet", async () => {
    const storage = new MemoryBackupExportStorage();

    const written = await storage.putLatestEvidence("first-body", null);

    expect(written).toBe(true);
    expect(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe("first-body");
  });

  it("rejects a publish guarded by expected: null once a pointer already exists", async () => {
    const storage = new MemoryBackupExportStorage();
    await storage.putLatestEvidence("existing-body", null);

    const written = await storage.putLatestEvidence("racing-body", null);

    expect(written).toBe(false);
    // The conflicting write must not have landed.
    expect(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe("existing-body");
  });

  it("advances the pointer when expected matches the current stored version", async () => {
    const storage = new MemoryBackupExportStorage();
    await storage.putLatestEvidence("first-body", null);
    const snapshot = await storage.getLatestEvidence();

    const written = await storage.putLatestEvidence("second-body", snapshot);

    expect(written).toBe(true);
    expect(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe("second-body");
  });

  it("rejects the write when expected carries a version that no longer matches (stale reader)", async () => {
    const storage = new MemoryBackupExportStorage();
    await storage.putLatestEvidence("first-body", null);
    const staleSnapshot = await storage.getLatestEvidence();

    // Someone else advances the pointer between the stale reader's read and its write attempt.
    await storage.putLatestEvidence("second-body", staleSnapshot);

    const written = await storage.putLatestEvidence("third-body", staleSnapshot);

    expect(written).toBe(false);
    expect(storage.objects.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY)).toBe("second-body");
  });

  it("returns the stored body and a matching version from getLatestEvidence after a successful write", async () => {
    const storage = new MemoryBackupExportStorage();
    await storage.putLatestEvidence("published-body", null);

    await expect(storage.getLatestEvidence()).resolves.toEqual({
      body: "published-body",
      version: "published-body",
    });
  });
});