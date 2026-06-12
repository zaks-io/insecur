import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireDatabaseUrl } from "../../../../packages/tenant-store/scripts/lib/env-local.mjs";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_SECRET_A_ID,
  TEST_VERSION_A_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { startConsoleCapture } from "./console-capture.js";
import { driveFirstValueWithSentinel } from "./drive-first-value.js";
import {
  formatSweepHits,
  simulateEncryptionBypassLeak,
  sweepAllSurfaces,
} from "./postgres-sweep.js";
import { mintCanarySentinel } from "./sentinel-encodings.js";

/**
 * No-plaintext canary gate (ADR-0069): drive the real route stack with a fresh sentinel,
 * then sweep every Postgres column (live information_schema) and captured console output
 * for raw/base64/base64url/hex encodings of the sentinel.
 */

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("no-plaintext canary (real DB, real crypto, HTTP routes)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("finds no sentinel in Postgres columns or captured console output after the First Value loop", async () => {
    const sentinel = mintCanarySentinel();
    const capture = startConsoleCapture();

    try {
      await driveFirstValueWithSentinel(sentinel.value);
    } finally {
      capture.stop();
    }

    const migrationUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
    const hits = await sweepAllSurfaces(migrationUrl, sentinel, capture.output);

    expect(hits, formatSweepHits(hits)).toEqual([]);
  });

  it("detects a deliberately persisted plaintext sentinel (negative control)", async () => {
    const sentinel = mintCanarySentinel();
    const migrationUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");

    const { rawHit } = await simulateEncryptionBypassLeak(migrationUrl, sentinel, {
      tableName: "secret_versions",
      columnName: "ciphertext_storage_ref",
      orgId: TEST_ORG_A_ID,
      secretId: TEST_SECRET_A_ID,
      versionId: TEST_VERSION_A_ID,
      restoreValue: "synthetic-ciphertext-ref",
    });

    expect(rawHit).toBeDefined();
    expect(rawHit?.surface).toBe("postgres");
    expect(rawHit?.tableName).toBe("secret_versions");
    expect(rawHit?.columnName).toBe("ciphertext_storage_ref");
    expect(rawHit?.redactedPrefix).toBe(sentinel.redactedPrefix);
  });
});
