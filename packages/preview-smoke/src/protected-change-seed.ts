import type postgres from "postgres";

import { withServiceRoleSql } from "./audit-verification-db.js";

type ServiceRoleSql = ReturnType<typeof postgres>;

export interface SeedSmokeProtectedPromotionDraftInput {
  readonly createdByUserId: string;
  readonly databaseUrl: string;
  readonly environmentId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly secretId: string;
  readonly secretVersionId: string;
  readonly variableKey: string;
}

export interface MutateSmokeProtectedPromotionDraftInput {
  readonly databaseUrl: string;
  readonly organizationId: string;
  readonly secretVersionId: string;
  readonly valueByteLength: number;
}

export async function seedSmokeProtectedPromotionDraft(
  input: SeedSmokeProtectedPromotionDraftInput,
): Promise<void> {
  await withServiceRoleSql(input.databaseUrl, async (sql) => {
    await seedProtectedEnvironment(sql, input);
    await seedProtectedSecret(sql, input);
    await seedProtectedDraftVersion(sql, input);
  });
}

async function seedProtectedEnvironment(
  sql: ServiceRoleSql,
  input: SeedSmokeProtectedPromotionDraftInput,
): Promise<void> {
  await sql`
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
      ${"Smoke protected approval preview"},
      ${true},
      ${"preview"}
    )
  `;
}

async function seedProtectedSecret(
  sql: ServiceRoleSql,
  input: SeedSmokeProtectedPromotionDraftInput,
): Promise<void> {
  await sql`
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
      ${input.variableKey},
      NULL
    )
  `;
}

async function seedProtectedDraftVersion(
  sql: ServiceRoleSql,
  input: SeedSmokeProtectedPromotionDraftInput,
): Promise<void> {
  await sql`
    INSERT INTO secret_versions (
      id,
      org_id,
      secret_id,
      version_number,
      organization_data_key_version,
      project_data_key_version,
      ciphertext_storage_ref,
      lifecycle_state,
      created_by_actor_type,
      created_by_user_id,
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
      ${`preview-smoke-protected-draft:${input.secretVersionId}`},
      ${"draft"},
      ${"user"},
      ${input.createdByUserId},
      ${24},
      ${"utf-8"},
      ${false},
      ${false},
      ${false},
      ${"matches"}
    )
  `;
}

export async function mutateSmokeProtectedPromotionDraftImpact(
  input: MutateSmokeProtectedPromotionDraftInput,
): Promise<void> {
  await withServiceRoleSql(input.databaseUrl, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      UPDATE secret_versions
      SET value_byte_length = ${input.valueByteLength}
      WHERE org_id = ${input.organizationId}
        AND id = ${input.secretVersionId}
        AND lifecycle_state = ${"draft"}
      RETURNING id
    `;
    if (rows.length !== 1) {
      throw new Error("Protected draft impact mutation did not update exactly one draft.");
    }
  });
}
