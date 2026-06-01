import { organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { seedTenantBaseline } from "./seed.js";
import { TEST_ORG_A_ID, TEST_ORG_B_ID, TEST_PROJECT_A_ID, TEST_PROJECT_B_ID } from "./test-ids.js";

const runtimeUrl = process.env.DATABASE_URL_RUNTIME;
const describeRls = runtimeUrl ? describe : describe.skip;

interface IdRow {
  id: string;
}

describeRls("tenant row-level security (real Postgres)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("rejects unscoped reads under the runtime role", async () => {
    if (!runtimeUrl) {
      return;
    }
    const sql = postgres(runtimeUrl, { prepare: false, max: 1 });
    try {
      const organizations = await sql`SELECT id FROM organizations`;
      expect(organizations).toEqual([]);
      const projects = await sql`SELECT id FROM projects`;
      expect(projects).toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("returns only the scoped organization rows", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => await sql<IdRow[]>`SELECT id FROM organizations ORDER BY id`,
    );
    expect(rows.map((row) => row.id)).toEqual([TEST_ORG_A_ID]);
  });

  it("blocks cross-organization reads when guessing opaque resource IDs", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const guessedProjectB = projectId.brand(TEST_PROJECT_B_ID);

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) =>
        await sql<IdRow[]>`
          SELECT id FROM projects WHERE id = ${guessedProjectB}
        `,
    );
    expect(rows).toEqual([]);
  });

  it("allows service scope to read across organizations", async () => {
    const rows = await withTenantScope(
      { kind: "service" },
      async (sql) => await sql<IdRow[]>`SELECT id FROM organizations ORDER BY id`,
    );
    expect(rows.map((row) => row.id)).toEqual([TEST_ORG_A_ID, TEST_ORG_B_ID]);
  });

  it("scopes project reads to the current organization", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => await sql<IdRow[]>`SELECT id FROM projects ORDER BY id`,
    );
    expect(rows.map((row) => row.id)).toEqual([TEST_PROJECT_A_ID]);
  });
});
