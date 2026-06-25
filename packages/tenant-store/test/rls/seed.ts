import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  redactDatabaseUrlsInText,
  redactLoggableError,
  requireDatabaseUrl,
} from "../../scripts/lib/env-local.mjs";
import { TENANT_STORE_SEED_LOCK_KEY } from "../../scripts/lib/test-advisory-locks.mjs";
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
  TEST_VERSION_A_ID,
  TEST_VERSION_B_ID,
  TEST_ORG_KEY_A_ID,
  TEST_ORG_KEY_B_ID,
  TEST_PROJECT_KEY_A_ID,
  TEST_PROJECT_KEY_B_ID,
  TEST_ORG_C_ID,
  TEST_PROJECT_C_ID,
  TEST_ENV_C_ID,
  TEST_TEAM_C_ID,
  TEST_MEM_C_ID,
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
  TEST_NO_SCOPE_USER_ID,
  TEST_NO_SCOPE_WORKOS_USER_ID,
  TEST_USER_ADMISSION_A_ID,
  TEST_USER_ADMISSION_NS_ID,
} from "./test-ids.js";
import { seedDataKeys } from "./seed-data-keys.js";
import { seedOrganizationCore, seedSecretWithVersion, type SeedOrgInput } from "./seed-rows.js";
import { isTenantStoreSchemaCurrent } from "../../scripts/lib/migration-current.mjs";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function throwMigrateFailure(migrate: ReturnType<typeof spawnSync>): never {
  const stderr = migrate.stderr?.toString("utf8") ?? "";
  const stdout = migrate.stdout?.toString("utf8") ?? "";
  const detail = redactDatabaseUrlsInText([stderr, stdout].filter(Boolean).join("\n").trim());
  throw new Error(detail === "" ? "migrate.mjs failed" : `migrate.mjs failed: ${detail}`);
}

async function runLocalMigrate(): Promise<void> {
  if (process.env.INSECUR_TEST_SKIP_MIGRATE === "1") {
    return;
  }
  const url = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
  if (await isTenantStoreSchemaCurrent(url)) {
    return;
  }
  const migrate = spawnSync("node", ["scripts/migrate.mjs"], {
    cwd: packageRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (migrate.status !== 0) {
    throwMigrateFailure(migrate);
  }
}

function createMigrationSql(url: string): postgres.Sql {
  try {
    return postgres(url, { prepare: false, max: 1 });
  } catch (error) {
    throw new Error(redactLoggableError(error), { cause: error });
  }
}

async function seedTenantBaselineLocked(sql: postgres.Sql): Promise<void> {
  await sql`
    INSERT INTO instances (id, display_name)
    VALUES (${TEST_INSTANCE_ID}, ${"Synthetic test instance"})
    ON CONFLICT (id) DO NOTHING
  `;

  await seedBaselineUserAdmissions(sql);

  await seedOrganization(sql, {
    organizationId: TEST_ORG_A_ID,
    projectId: TEST_PROJECT_A_ID,
    environmentId: TEST_ENV_A_ID,
    teamId: TEST_TEAM_A_ID,
    membershipId: TEST_MEM_A_ID,
    secretId: TEST_SECRET_A_ID,
    secretVersionId: TEST_VERSION_A_ID,
    organizationDataKeyId: TEST_ORG_KEY_A_ID,
    projectDataKeyId: TEST_PROJECT_KEY_A_ID,
  });
  await seedOrganization(sql, {
    organizationId: TEST_ORG_B_ID,
    projectId: TEST_PROJECT_B_ID,
    environmentId: TEST_ENV_B_ID,
    teamId: TEST_TEAM_B_ID,
    membershipId: TEST_MEM_B_ID,
    secretId: TEST_SECRET_B_ID,
    secretVersionId: TEST_VERSION_B_ID,
    organizationDataKeyId: TEST_ORG_KEY_B_ID,
    projectDataKeyId: TEST_PROJECT_KEY_B_ID,
  });
  await seedTenantWithoutDataKeys(sql, {
    organizationId: TEST_ORG_C_ID,
    projectId: TEST_PROJECT_C_ID,
    environmentId: TEST_ENV_C_ID,
    teamId: TEST_TEAM_C_ID,
    membershipId: TEST_MEM_C_ID,
  });
}

export async function seedTenantBaseline(): Promise<void> {
  const url = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
  await runLocalMigrate();
  const sql = createMigrationSql(url);
  try {
    await sql`SELECT pg_advisory_lock(${TENANT_STORE_SEED_LOCK_KEY})`;
    try {
      await seedTenantBaselineLocked(sql);
    } finally {
      await sql`SELECT pg_advisory_unlock(${TENANT_STORE_SEED_LOCK_KEY})`;
    }
  } catch (error) {
    throw new Error(redactLoggableError(error), { cause: error });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedBaselineUserAdmissions(sql: postgres.Sql): Promise<void> {
  await sql`
    INSERT INTO user_admissions (
      id,
      instance_id,
      user_id,
      workos_user_id,
      display_name,
      status
    )
    VALUES
      (
        ${TEST_USER_ADMISSION_A_ID},
        ${TEST_INSTANCE_ID},
        ${TEST_USER_ID},
        ${TEST_WORKOS_USER_ID},
        ${"Synthetic baseline user"},
        ${"active"}
      ),
      (
        ${TEST_USER_ADMISSION_NS_ID},
        ${TEST_INSTANCE_ID},
        ${TEST_NO_SCOPE_USER_ID},
        ${TEST_NO_SCOPE_WORKOS_USER_ID},
        ${"Synthetic no-scope user"},
        ${"active"}
      )
    ON CONFLICT (instance_id, workos_user_id) DO UPDATE
    SET
      id = EXCLUDED.id,
      user_id = EXCLUDED.user_id,
      display_name = EXCLUDED.display_name,
      status = ${"active"},
      revoked_at = NULL,
      updated_at = now()
  `;
}

async function seedOrganization(sql: postgres.Sql, input: SeedOrgInput): Promise<void> {
  await sql.begin(async (tx) => {
    await seedOrganizationCore(tx, input);
    await seedDataKeys(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      organizationDataKeyId: input.organizationDataKeyId,
      projectDataKeyId: input.projectDataKeyId,
    });
    await seedSecretWithVersion(tx, input);
  });
}

interface SeedTenantWithoutDataKeysInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  teamId: string;
  membershipId: string;
}

// Tenant C: org/project/team/membership/environment with NO data keys and NO seeded secret. The
// first-use-mint suite writes here so its destructive DEK minting never touches the shared A/B
// baseline rows other suites read concurrently on the same local Postgres.
async function seedTenantWithoutDataKeys(
  sql: postgres.Sql,
  input: SeedTenantWithoutDataKeysInput,
): Promise<void> {
  await sql.begin(async (tx) => {
    await seedOrganizationCore(tx, {
      ...input,
      secretId: "",
      secretVersionId: "",
      organizationDataKeyId: "",
      projectDataKeyId: "",
    });
  });
}

interface SeedMutationTenantInput extends SeedTenantWithoutDataKeysInput {
  organizationDataKeyId: string;
  projectDataKeyId: string;
}

// Seeds a dedicated MUTATION tenant (D/E): core org rows plus active v1 org+project data keys, on a
// private connection in one transaction. The rewrap and readiness suites call this in setup, then
// destructively mutate the seeded data keys (root_key_version bump; status -> retired/revoked).
// `seedTenantBaseline` deliberately never seeds D/E, so concurrent cross-package re-seeds (run by
// access/audit/operations against the same local Postgres) can never flip a mutation back mid-test.
// Self-contained: opens and closes its own connection so the destructive suites need no postgres
// bookkeeping and never nest this inside a tenant-scoped transaction.
export async function seedMutationTenant(input: SeedMutationTenantInput): Promise<void> {
  const url = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
  const sql = createMigrationSql(url);
  try {
    await sql.begin(async (tx) => {
      await seedOrganizationCore(tx, {
        ...input,
        secretId: "",
        secretVersionId: "",
      });
      await seedDataKeys(tx, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        organizationDataKeyId: input.organizationDataKeyId,
        projectDataKeyId: input.projectDataKeyId,
      });
    });
  } catch (error) {
    throw new Error(redactLoggableError(error), { cause: error });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
