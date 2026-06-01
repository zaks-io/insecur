import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  TEST_ENV_A_ID,
  TEST_ENV_B_ID,
  TEST_INSTANCE_ID,
  TEST_MEM_A_ID,
  TEST_MEM_B_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_SECRET_A_ID,
  TEST_SECRET_B_ID,
  TEST_TEAM_A_ID,
  TEST_TEAM_B_ID,
  TEST_USER_ID,
  TEST_VERSION_A_ID,
  TEST_VERSION_B_ID,
} from "./test-ids.js";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export async function seedTenantBaseline(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL_MIGRATION is required to seed RLS test data");
  }

  const migrate = spawnSync("node", ["scripts/migrate.mjs"], {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (migrate.status !== 0) {
    throw new Error("migrate.mjs failed");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql`
      INSERT INTO instances (id, display_name)
      VALUES (${TEST_INSTANCE_ID}, ${"Synthetic test instance"})
      ON CONFLICT (id) DO NOTHING
    `;

    await seedOrganization(sql, {
      organizationId: TEST_ORG_A_ID,
      projectId: TEST_PROJECT_A_ID,
      environmentId: TEST_ENV_A_ID,
      teamId: TEST_TEAM_A_ID,
      membershipId: TEST_MEM_A_ID,
      secretId: TEST_SECRET_A_ID,
      secretVersionId: TEST_VERSION_A_ID,
    });
    await seedOrganization(sql, {
      organizationId: TEST_ORG_B_ID,
      projectId: TEST_PROJECT_B_ID,
      environmentId: TEST_ENV_B_ID,
      teamId: TEST_TEAM_B_ID,
      membershipId: TEST_MEM_B_ID,
      secretId: TEST_SECRET_B_ID,
      secretVersionId: TEST_VERSION_B_ID,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

interface SeedOrgInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  teamId: string;
  membershipId: string;
  secretId: string;
  secretVersionId: string;
}

async function seedOrganization(sql: postgres.Sql, input: SeedOrgInput): Promise<void> {
  await sql.begin(async (tx) => {
    await seedOrganizationCore(tx, input);
    await seedSecretWithVersion(tx, input);
  });
}

async function seedOrganizationCore(
  tx: postgres.TransactionSql,
  input: SeedOrgInput,
): Promise<void> {
  await tx`SELECT set_config('app.current_org', ${input.organizationId}, true)`;
  await tx`
    INSERT INTO organizations (id, instance_id, display_name)
    VALUES (${input.organizationId}, ${TEST_INSTANCE_ID}, ${"Synthetic org"})
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    INSERT INTO projects (id, org_id, display_name)
    VALUES (${input.projectId}, ${input.organizationId}, ${"Synthetic project"})
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    INSERT INTO teams (id, org_id, display_name, is_default)
    VALUES (${input.teamId}, ${input.organizationId}, ${"Default team"}, true)
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    INSERT INTO memberships (id, org_id, team_id, user_id, role_preset)
    VALUES (
      ${input.membershipId},
      ${input.organizationId},
      ${input.teamId},
      ${TEST_USER_ID},
      ${"owner"}
    )
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    INSERT INTO environments (id, org_id, project_id, display_name)
    VALUES (${input.environmentId}, ${input.organizationId}, ${input.projectId}, ${"Synthetic env"})
    ON CONFLICT (id) DO NOTHING
  `;
}

async function seedSecretWithVersion(
  tx: postgres.TransactionSql,
  input: SeedOrgInput,
): Promise<void> {
  await tx`
    INSERT INTO secrets (
      id,
      org_id,
      project_id,
      environment_id,
      variable_key,
      current_version_id
    )
    VALUES (
      ${input.secretId},
      ${input.organizationId},
      ${input.projectId},
      ${input.environmentId},
      ${"SYNTHETIC_TEST_KEY"},
      NULL
    )
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    INSERT INTO secret_versions (
      id,
      org_id,
      secret_id,
      version_number,
      ciphertext_storage_ref
    )
    VALUES (
      ${input.secretVersionId},
      ${input.organizationId},
      ${input.secretId},
      ${1},
      ${"synthetic-ciphertext-ref"}
    )
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    UPDATE secrets
    SET current_version_id = ${input.secretVersionId}
    WHERE id = ${input.secretId}
  `;
}
