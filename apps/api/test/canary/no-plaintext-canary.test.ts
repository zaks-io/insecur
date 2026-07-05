import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireDatabaseUrl } from "../../../../packages/tenant-store/scripts/lib/env-local.mjs";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_SECRET_A_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { startConsoleCapture } from "./console-capture.js";
import { driveFirstValueWithSentinel } from "./drive-first-value.js";
import { formatEgressSweepHits, simulateEgressLeak, sweepEgressSurfaces } from "./egress-sweep.js";
import {
  formatSweepHits,
  simulateEncryptionBypassLeak,
  sweepAllSurfaces,
} from "./postgres-sweep.js";
import { mintCanarySentinel } from "./sentinel-encodings.js";

/**
 * No-plaintext canary gate (ADR-0069): drive the real route stack with a fresh sentinel,
 * then sweep every Postgres column (live information_schema), captured console output,
 * and serialized HTTP/RPC egress for raw/base64/base64url/hex encodings of the sentinel.
 */

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("no-plaintext canary (real DB, real crypto, HTTP routes)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("finds no sentinel in Postgres columns, console output, or serialized egress after the First Value loop", async () => {
    const sentinel = mintCanarySentinel();
    const capture = startConsoleCapture();
    let egress;

    try {
      egress = await driveFirstValueWithSentinel(sentinel.value);
    } finally {
      capture.stop();
    }

    const migrationUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
    const persistenceHits = await sweepAllSurfaces(migrationUrl, sentinel, capture.output);
    const egressHits = sweepEgressSurfaces(egress, sentinel);
    const hits = [...persistenceHits, ...egressHits];
    const formatted = [formatSweepHits(persistenceHits), formatEgressSweepHits(egressHits)]
      .filter((entry) => entry.length > 0)
      .join("\n");

    expect(hits, formatted).toEqual([]);
  });

  it("detects a deliberately persisted plaintext sentinel (negative control)", async () => {
    const sentinel = mintCanarySentinel();
    const migrationUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");

    const { rawHit } = await simulateEncryptionBypassLeak(migrationUrl, sentinel, {
      tableName: "secret_versions",
      columnName: "ciphertext_storage_ref",
      orgId: TEST_ORG_A_ID,
      secretId: TEST_SECRET_A_ID,
    });

    expect(rawHit).toBeDefined();
    expect(rawHit?.surface).toBe("postgres");
    expect(rawHit?.tableName).toBe("secret_versions");
    expect(rawHit?.columnName).toBe("ciphertext_storage_ref");
    expect(rawHit?.redactedPrefix).toBe(sentinel.redactedPrefix);
  });

  it("detects a deliberately leaked plaintext sentinel in serialized egress (negative control)", () => {
    const sentinel = mintCanarySentinel();
    const { rawHit } = simulateEgressLeak(sentinel);

    expect(rawHit).toBeDefined();
    expect(rawHit?.surface).toBe("egress");
    expect(rawHit?.location).toBe("http.consume.body");
    expect(rawHit?.jsonPath).toBe("debug");
    expect(rawHit?.encoding).toBe("raw");
    expect(rawHit?.redactedPrefix).toBe(sentinel.redactedPrefix);
  });
});
