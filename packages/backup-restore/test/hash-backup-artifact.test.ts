import { describe, expect, it } from "vitest";

import { hashBackupArtifact } from "../src/hash-backup-artifact.js";

describe("hashBackupArtifact", () => {
  it("returns the same digest for the same sealed bytes", async () => {
    const sealedArtifact = new Uint8Array([1, 2, 3, 4]);

    expect(await hashBackupArtifact(sealedArtifact)).toBe(await hashBackupArtifact(sealedArtifact));
  });

  it("returns a distinct digest for different sealed bytes", async () => {
    const first = await hashBackupArtifact(new Uint8Array([1, 2, 3, 4]));
    const second = await hashBackupArtifact(new Uint8Array([1, 2, 3, 5]));

    expect(first).not.toBe(second);
  });

  it("encodes the digest as unpadded base64url", async () => {
    const digest = await hashBackupArtifact(new Uint8Array([1, 2, 3, 4]));

    expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(digest).not.toMatch(/[+/=]/);
  });
});
