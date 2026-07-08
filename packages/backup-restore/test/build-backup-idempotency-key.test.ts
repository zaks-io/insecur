import { isMetadataSafeOpaqueTokenString } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { buildBackupExportIdempotencyKey } from "../src/build-backup-idempotency-key.js";

describe("buildBackupExportIdempotencyKey", () => {
  const scheduledAt = new Date("2026-07-08T03:00:00.000Z");

  it("derives a deterministic metadata-safe opaque token from the schedule instant", () => {
    const key = buildBackupExportIdempotencyKey(scheduledAt);
    expect(key).toBe("backup.export.2026-07-08T03.00.00.000Z");
    expect(isMetadataSafeOpaqueTokenString(key)).toBe(true);
    expect(buildBackupExportIdempotencyKey(scheduledAt)).toBe(key);
  });

  it("returns a distinct key per distinct scheduled run so each run is a new Operation", () => {
    const other = buildBackupExportIdempotencyKey(new Date("2026-07-09T03:00:00.000Z"));
    expect(other).not.toBe(buildBackupExportIdempotencyKey(scheduledAt));
  });
});
