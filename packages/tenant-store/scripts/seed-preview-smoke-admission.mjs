#!/usr/bin/env node
/**
 * Seeds the shared preview database with the instance shell and smoke-test User admission row.
 * Replaces the former ADMITTED_USER_MAP_JSON Worker var: admission is persisted in Postgres.
 */
import postgres from "postgres";
import { requireDatabaseUrl } from "./lib/env-local.mjs";

// Keep in sync with packages/preview-smoke/src/preview-smoke-no-scope-actor.ts
const PREVIEW_SMOKE_NO_SCOPE_ADMITTED_USER_ID = "usr_0000000000000000000000SMK3";
const PREVIEW_SMOKE_NO_SCOPE_WORKOS_USER_ID = "user_01workos_preview_smoke_noscope";
const PREVIEW_SMOKE_NO_SCOPE_USER_ADMISSION_ID = "uad_0000000000000000000000SMK3";

// Keep in sync with RECOVERY_CANARY_ORGANIZATION_ID / _DISPLAY_NAME in
// packages/domain/src/recovery-canary-scope.ts. The daily backup export records its Operation and
// audit events under this org (both FK organizations.id), so the row must exist before the first
// scheduled cron fires (ADR-0058 / ADR-0072). Seeded here for preview and any instance provisioned
// outside the bootstrap ceremony; bootstrap seeds it too.
const RECOVERY_CANARY_ORGANIZATION_ID = "org_01RCAN00000000000000000001";
const RECOVERY_CANARY_ORGANIZATION_DISPLAY_NAME = "Recovery Canary";

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
const noScopeActor = {
  admissionId:
    process.env.SMOKE_NO_SCOPE_USER_ADMISSION_ID ?? PREVIEW_SMOKE_NO_SCOPE_USER_ADMISSION_ID,
  displayName: "Preview smoke no-scope user",
  userId: process.env.SMOKE_NO_SCOPE_ADMITTED_USER_ID ?? PREVIEW_SMOKE_NO_SCOPE_ADMITTED_USER_ID,
  workosUserId: process.env.SMOKE_NO_SCOPE_WORKOS_USER_ID ?? PREVIEW_SMOKE_NO_SCOPE_WORKOS_USER_ID,
};
const operatorGrantId = process.env.SMOKE_INSTANCE_OPERATOR_ID ?? "iop_00000000000000000000000SMK";

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  // The migration role is NOBYPASSRLS, so instance-scope writes need a tenant-visibility context.
  // app.service='true' is the engine's cross-organization gate (ADR-0037) and is the correct scope
  // for seeding standing instance-scope singletons like the recovery-canary organization.
  await sql`SELECT set_config('app.service', 'true', false)`;
  await sql`
    INSERT INTO instances (id, display_name)
    VALUES (${instanceId}, ${"Preview smoke instance"})
    ON CONFLICT (id) DO NOTHING
  `;
  await upsertAdmission(ownerActor);
  await upsertAdmission(inviteeActor);
  await upsertAdmission(noScopeActor);
  await sql`
    INSERT INTO organizations (id, instance_id, display_name)
    VALUES (
      ${RECOVERY_CANARY_ORGANIZATION_ID},
      ${instanceId},
      ${RECOVERY_CANARY_ORGANIZATION_DISPLAY_NAME}
    )
    ON CONFLICT (id) DO NOTHING
  `;
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
      noScopeUserId: noScopeActor.userId,
      noScopeWorkosUserId: noScopeActor.workosUserId,
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
