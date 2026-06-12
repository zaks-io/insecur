import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  assertInformationSchemaPlaintextMetadataConformance,
  type InformationSchemaColumnRow,
} from "../../src/db/schema/plaintext-metadata-conformance.js";
import { requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";
import { integrationDatabaseReady } from "./integration-database-ready.js";

if (process.env.INSECUR_CI_RLS_GATE === "1" && !integrationDatabaseReady) {
  throw new Error(
    "CI RLS gate requires DATABASE_URL_RUNTIME to be configured and Postgres to accept connections",
  );
}

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("plaintext metadata allowlist (integration layer)", () => {
  it("conforms to live information_schema columns with zero drift in either direction", async () => {
    const databaseUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
    const sql = postgres(databaseUrl, { max: 1 });

    try {
      const rows = await sql<InformationSchemaColumnRow[]>`
        SELECT table_name AS "tableName", column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;

      expect(() => assertInformationSchemaPlaintextMetadataConformance(rows)).not.toThrow();
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
