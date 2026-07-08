import { isMetadataSafeOpaqueTokenString } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  buildBackupExportIdempotencyKey,
  buildBackupExportTransitionIdempotencyKey,
} from "../src/build-backup-idempotency-key.js";

describe("buildBackupExportIdempotencyKey", () => {
  const scheduledAt = new Date("2026-07-08T03:00:00.000Z");

  it("derives a deterministic metadata-safe opaque token from the schedule instant", () => {
    const key = buildBackupExportIdempotencyKey(scheduledAt);
    expect(key).toBe("backup.export.2026-07-08T03.00.00.000Z");
    expect(isMetadataSafeOpaqueTokenString(key)).toBe(true);
    expect(buildBackupExportIdempotencyKey(scheduledAt)).toBe(key);
  });

  it("builds transition keys that remain metadata-safe opaque tokens", () => {
    for (const phase of ["running", "succeeded", "failed"] as const) {
      const key = buildBackupExportTransitionIdempotencyKey(scheduledAt, phase);
      expect(key).toBe(`backup.export.2026-07-08T03.00.00.000Z.${phase}`);
      expect(isMetadataSafeOpaqueTokenString(key)).toBe(true);
    }
  });
});
