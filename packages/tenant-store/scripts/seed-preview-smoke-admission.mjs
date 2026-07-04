#!/usr/bin/env node
/**
 * Seeds the shared preview database with the instance shell and smoke-test User admission row.
 * Replaces the former ADMITTED_USER_MAP_JSON Worker var: admission is persisted in Postgres.
 */
import postgres from "postgres";
import { requireDatabaseUrl } from "./lib/env-local.mjs";

const databaseUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
const instanceId = process.env.INSTANCE_ID ?? "inst_LOCAL_DEV";
const ownerActor = {
  admissionId: process.env.SMOKE_USER_ADMISSION_ID ?? "uad_00000000000000000000000SMK",
  displayName: "Preview smoke owner user",
  userId: requireEnv("SMOKE_ADMITTED_USER_ID"),
  workosUserId: requireEnv("SMOKE_WORKOS_USER_ID"),
};
const inviteeActor = {
  admissionId: process.env.SMOKE_INVITEE_USER_ADMISSION_ID ?? "uad_0000000000000000000000SMK2",
  displayName: "Preview smoke invitee user",
  userId: requireEnv("SMOKE_INVITEE_ADMITTED_USER_ID"),
  workosUserId: requireEnv("SMOKE_INVITEE_WORKOS_USER_ID"),
};
const operatorGrantId = process.env.SMOKE_INSTANCE_OPERATOR_ID ?? "iop_00000000000000000000000SMK";

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  await sql`
    INSERT INTO instances (id, display_name)
    VALUES (${instanceId}, ${"Preview smoke instance"})
    ON CONFLICT (id) DO NOTHING
  `;
  await upsertAdmission(ownerActor);
  await upsertAdmission(inviteeActor);
  await sql`
    INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
    VALUES (${operatorGrantId}, ${instanceId}, ${ownerActor.userId}, ${"admin"})
    ON CONFLICT (id) DO UPDATE
    SET
      instance_id = EXCLUDED.instance_id,
      user_id = EXCLUDED.user_id,
      grant_origin = ${"admin"}
  `;
  process.stdout.write(
    JSON.stringify({
      ok: true,
      instanceId,
      ownerUserId: ownerActor.userId,
      ownerWorkosUserId: ownerActor.workosUserId,
      inviteeUserId: inviteeActor.userId,
      inviteeWorkosUserId: inviteeActor.workosUserId,
      operatorGrantId,
    }) + "\n",
  );
} finally {
  await sql.end({ timeout: 5 });
}

async function upsertAdmission(actor) {
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
      ${actor.admissionId},
      ${instanceId},
      ${actor.userId},
      ${actor.workosUserId},
      ${actor.displayName},
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

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}
