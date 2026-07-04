import { afterAll, describe, expect, it } from "vitest";

import { closeRuntimeSql, withTenantScope } from "../src/index.js";
import { integrationDatabaseReady } from "./rls/integration-database-ready.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("migration 0011 connection_method backfill SQL", () => {
  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("maps legacy provider slugs to connection method codes", async () => {
    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      await sql`
        CREATE TEMP TABLE app_connections_backfill_probe (
          provider text NOT NULL,
          connection_method text
        ) ON COMMIT DROP
      `;
      await sql`
        INSERT INTO app_connections_backfill_probe (provider, connection_method)
        VALUES
          ('github', NULL),
          ('cloudflare', NULL),
          ('vercel', NULL)
      `;
      await sql`
        UPDATE app_connections_backfill_probe
        SET connection_method = CASE provider
          WHEN 'github' THEN 'github-app'
          WHEN 'cloudflare' THEN 'scoped-api-token'
          WHEN 'vercel' THEN 'vercel-integration-oauth'
        END
        WHERE connection_method IS NULL
      `;
      return await sql<{ provider: string; connection_method: string }[]>`
        SELECT provider, connection_method
        FROM app_connections_backfill_probe
        ORDER BY provider
      `;
    });

    expect(rows).toEqual([
      { provider: "cloudflare", connection_method: "scoped-api-token" },
      { provider: "github", connection_method: "github-app" },
      { provider: "vercel", connection_method: "vercel-integration-oauth" },
    ]);
  });
});
