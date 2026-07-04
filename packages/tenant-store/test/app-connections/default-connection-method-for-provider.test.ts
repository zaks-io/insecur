import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONNECTION_METHOD_BY_PROVIDER,
  defaultConnectionMethodForProvider,
} from "../../src/app-connections/default-connection-method-for-provider.js";

const MIGRATION_PATH = join(
  import.meta.dirname,
  "../../drizzle/0011_app_connections_provider_registration.sql",
);

describe("defaultConnectionMethodForProvider", () => {
  it("maps each supported provider slug to its default connection method", () => {
    expect(defaultConnectionMethodForProvider("github")).toBe("github-app");
    expect(defaultConnectionMethodForProvider("cloudflare")).toBe("scoped-api-token");
    expect(defaultConnectionMethodForProvider("vercel")).toBe("vercel-integration-oauth");
    expect(DEFAULT_CONNECTION_METHOD_BY_PROVIDER).toEqual({
      github: "github-app",
      cloudflare: "scoped-api-token",
      vercel: "vercel-integration-oauth",
    });
  });
});

describe("migration 0011 app_connections backfill", () => {
  const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

  it("does not copy legacy provider slugs directly into connection_method", () => {
    expect(migrationSql).not.toContain('"connection_method" = "provider"');
  });

  it("backfills connection_method from provider using explicit method codes", () => {
    expect(migrationSql).toContain("WHEN 'github' THEN 'github-app'");
    expect(migrationSql).toContain("WHEN 'cloudflare' THEN 'scoped-api-token'");
    expect(migrationSql).toContain("WHEN 'vercel' THEN 'vercel-integration-oauth'");
  });
});
