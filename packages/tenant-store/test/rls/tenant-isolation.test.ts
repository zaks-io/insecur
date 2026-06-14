import { organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, expect, it } from "vitest";
import postgres from "postgres";
import { redactLoggableError } from "../../scripts/lib/env-local.mjs";
import { closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { describeRls, getRuntimeDatabaseUrl } from "./describe-rls.js";
import { seedTenantBaseline } from "./seed.js";
import {
  TEST_MEM_CROSS_ORG_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_ORG_C_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_SECRET_A_ID,
  TEST_TEAM_B_ID,
  TEST_USER_ID,
  TEST_VERSION_A_ID,
  TEST_VERSION_B_ID,
} from "./test-ids.js";

const runtimeUrl = getRuntimeDatabaseUrl();

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
    let sql;
    try {
      sql = postgres(runtimeUrl, { prepare: false, max: 1 });
    } catch (error) {
      throw new Error(redactLoggableError(error), { cause: error });
    }
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
      async ({ sql }) => await sql<IdRow[]>`SELECT id FROM organizations ORDER BY id`,
    );
    expect(rows.map((row) => row.id)).toEqual([TEST_ORG_A_ID]);
  });

  it("blocks cross-organization reads when guessing opaque resource IDs", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const guessedProjectB = projectId.brand(TEST_PROJECT_B_ID);

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ sql }) =>
        await sql<IdRow[]>`
          SELECT id FROM projects WHERE id = ${guessedProjectB}
        `,
    );
    expect(rows).toEqual([]);
  });

  it("allows service scope to read across organizations", async () => {
    const rows = await withTenantScope(
      { kind: "service" },
      async ({ sql }) => await sql<IdRow[]>`SELECT id FROM organizations ORDER BY id`,
    );
    // Service scope is not org-restricted: it sees every baseline tenant, unlike org scope which sees
    // exactly one. Assert containment, not an exact list — the mutation tenants (D/E) other RLS
    // suites seed on this shared local Postgres may also be present depending on run order.
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([TEST_ORG_A_ID, TEST_ORG_B_ID, TEST_ORG_C_ID]));
    expect(ids.length).toBeGreaterThan(1);
  });

  it("scopes project reads to the current organization", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ sql }) => await sql<IdRow[]>`SELECT id FROM projects ORDER BY id`,
    );
    expect(rows.map((row) => row.id)).toEqual([TEST_PROJECT_A_ID]);
  });

  it("rejects audit_events inserts for another organization under tenant scope", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const crossTenantAuditId = "aud_00000000000000000000000099";

    await expect(
      withTenantScope({ kind: "organization", organizationId: orgA }, async ({ sql }) => {
        await sql`
          INSERT INTO audit_events (
            id,
            org_id,
            event_code,
            outcome,
            result_code,
            actor_type,
            actor_user_id
          ) VALUES (
            ${crossTenantAuditId},
            ${TEST_ORG_B_ID},
            ${"access.denied"},
            ${"denied"},
            ${"auth.insufficient_scope"},
            ${"user"},
            ${TEST_USER_ID}
          )
        `;
      }),
    ).rejects.toThrow();

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ sql }) =>
        await sql<IdRow[]>`
          SELECT id FROM audit_events WHERE id = ${crossTenantAuditId}
        `,
    );
    expect(rows).toEqual([]);
  });

  it("rejects membership inserts that reference a team from another organization", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);

    await expect(
      withTenantScope({ kind: "organization", organizationId: orgA }, async ({ sql }) => {
        await sql`
          INSERT INTO memberships (id, org_id, team_id, user_id, role_preset)
          VALUES (
            ${TEST_MEM_CROSS_ORG_ID},
            ${TEST_ORG_A_ID},
            ${TEST_TEAM_B_ID},
            ${TEST_USER_ID},
            ${"developer"}
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "23503" });

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ sql }) =>
        await sql<IdRow[]>`
          SELECT id FROM memberships WHERE id = ${TEST_MEM_CROSS_ORG_ID}
        `,
    );
    expect(rows).toEqual([]);
  });

  it("rejects secret updates that point current_version_id at another organization version", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);

    await expect(
      withTenantScope({ kind: "organization", organizationId: orgA }, async ({ sql }) => {
        await sql`
          UPDATE secrets
          SET current_version_id = ${TEST_VERSION_B_ID}
          WHERE id = ${TEST_SECRET_A_ID}
        `;
      }),
    ).rejects.toMatchObject({ code: "23503" });

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ sql }) =>
        await sql<{ current_version_id: string | null }[]>`
          SELECT current_version_id FROM secrets WHERE id = ${TEST_SECRET_A_ID}
        `,
    );
    expect(rows[0]?.current_version_id).toBe(TEST_VERSION_A_ID);
  });
});
