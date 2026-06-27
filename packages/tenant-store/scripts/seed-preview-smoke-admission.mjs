#!/usr/bin/env node
/**
 * Seeds the shared preview database with the instance shell and smoke-test User admission row.
 * Replaces the former ADMITTED_USER_MAP_JSON Worker var: admission is persisted in Postgres.
 */
import postgres from "postgres";
import { requireDatabaseUrl } from "./lib/env-local.mjs";

const databaseUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
const instanceId = process.env.INSTANCE_ID ?? "inst_LOCAL_DEV";
const workosUserId = requireEnv("SMOKE_WORKOS_USER_ID");
const admittedUserId = requireEnv("SMOKE_ADMITTED_USER_ID");
const admissionId = process.env.SMOKE_USER_ADMISSION_ID ?? "uad_00000000000000000000000SMK";

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  await sql`
    INSERT INTO instances (id, display_name)
    VALUES (${instanceId}, ${"Preview smoke instance"})
    ON CONFLICT (id) DO NOTHING
  `;
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
      ${instanceId},
      ${admittedUserId},
      ${workosUserId},
      ${"Preview smoke admitted user"},
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
  process.stdout.write(
    JSON.stringify({ ok: true, instanceId, workosUserId, admittedUserId }) + "\n",
  );
} finally {
  await sql.end({ timeout: 5 });
}

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}
