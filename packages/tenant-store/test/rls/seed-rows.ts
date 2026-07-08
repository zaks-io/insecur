import type postgres from "postgres";
import { TEST_INSTANCE_ID, TEST_USER_ID } from "./test-ids.js";

// Low-level synthetic-row inserts shared by the baseline seeder (seed.ts) and the dedicated
// mutation/no-data-key tenant seeders. Every insert is ON CONFLICT DO NOTHING so concurrent
// cross-package seeds on the same local Postgres are idempotent.

export interface SeedOrgInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  teamId: string;
  membershipId: string;
  secretId: string;
  secretVersionId: string;
  organizationDataKeyId: string;
  projectDataKeyId: string;
}

export async function seedOrganizationCore(
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
  await seedDevelopmentEnvironment(tx, input);
}

async function seedDevelopmentEnvironment(
  tx: postgres.TransactionSql,
  input: SeedOrgInput,
): Promise<void> {
  await tx`
    INSERT INTO environments (
      id,
      org_id,
      project_id,
      display_name,
      is_protected,
      lifecycle_stage
    )
    VALUES (
      ${input.environmentId},
      ${input.organizationId},
      ${input.projectId},
      ${"Synthetic env"},
      false,
      ${"development"}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function insertSyntheticSecretVersion(
  tx: postgres.TransactionSql,
  input: SeedOrgInput,
): Promise<void> {
  await tx`
    INSERT INTO secret_versions (
      id,
      org_id,
      secret_id,
      version_number,
      organization_data_key_version,
      project_data_key_version,
      ciphertext_storage_ref,
      lifecycle_state,
      value_byte_length,
      encoding_class,
      is_empty,
      has_leading_or_trailing_whitespace,
      looks_like_placeholder,
      secret_shape_match_verdict
    )
    VALUES (
      ${input.secretVersionId},
      ${input.organizationId},
      ${input.secretId},
      ${1},
      ${1},
      ${1},
      ${"synthetic-ciphertext-ref"},
      ${"live"},
      ${0},
      ${"utf-8"},
      ${true},
      ${false},
      ${false},
      ${"no_shape_rule"}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function seedSecretWithVersion(
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
  await insertSyntheticSecretVersion(tx, input);
  await tx`
    UPDATE secrets
    SET current_version_id = ${input.secretVersionId},
        live_version_number = ${1}
    WHERE id = ${input.secretId}
  `;
}
