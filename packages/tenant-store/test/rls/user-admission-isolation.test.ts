import { userId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeRuntimeSql,
  resolveAdmittedUserId,
  revokeUserAdmission,
  withTenantScope,
} from "../../src/index.js";
import { integrationDatabaseReady } from "./integration-database-ready.js";
import { seedTenantBaseline } from "./seed.js";
import { TEST_INSTANCE_ID, TEST_USER_ID, TEST_WORKOS_USER_ID } from "./test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

interface AdmissionRow {
  id: string;
  status: string;
}

describeIntegration("user admissions (persisted admitted-user resolution)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("resolves an active admission to the admitted User id", async () => {
    const resolved = await resolveAdmittedUserId(TEST_INSTANCE_ID, TEST_WORKOS_USER_ID);
    expect(resolved).toBe(userId.brand(TEST_USER_ID));
  });

  it("returns null for unknown WorkOS subjects", async () => {
    const resolved = await resolveAdmittedUserId(TEST_INSTANCE_ID, "user_01workos_unknown");
    expect(resolved).toBeNull();
  });

  it("fails closed for revoked admissions", async () => {
    const revokedWorkosUserId = "user_01workos_revoked_once";
    const revokedUser = userId.brand("usr_00000000000000000000000RV1");
    const admissionId = "uad_00000000000000000000000RV1";

    await withTenantScope({ kind: "service" }, async ({ sql }) => {
      await sql`
        INSERT INTO user_admissions (
          id,
          instance_id,
          user_id,
          workos_user_id,
          display_name,
          status
        )
        VALUES (
          ${admissionId},
          ${TEST_INSTANCE_ID},
          ${revokedUser},
          ${revokedWorkosUserId},
          ${"Revoked test user"},
          ${"active"}
        )
        ON CONFLICT (instance_id, workos_user_id) DO UPDATE
        SET status = ${"active"}, revoked_at = NULL, user_id = EXCLUDED.user_id
      `;
    });

    await revokeUserAdmission(TEST_INSTANCE_ID, revokedWorkosUserId);
    const resolved = await resolveAdmittedUserId(TEST_INSTANCE_ID, revokedWorkosUserId);
    expect(resolved).toBeNull();

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<AdmissionRow[]>`
        SELECT id, status
        FROM user_admissions
        WHERE instance_id = ${TEST_INSTANCE_ID}
          AND workos_user_id = ${revokedWorkosUserId}
      `;
    });
    expect(rows[0]?.status).toBe("revoked");
  });

  it("mirrors instance bootstrap posture without tenant RLS policies", async () => {
    const policyRows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ policyname: string }[]>`
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_admissions'
      `;
    });
    expect(policyRows).toEqual([]);

    const serviceRows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<AdmissionRow[]>`
        SELECT id, status
        FROM user_admissions
        WHERE instance_id = ${TEST_INSTANCE_ID}
          AND workos_user_id = ${TEST_WORKOS_USER_ID}
      `;
    });
    expect(serviceRows[0]?.status).toBe("active");
  });
});
