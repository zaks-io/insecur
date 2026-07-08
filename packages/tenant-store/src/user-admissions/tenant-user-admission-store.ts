import { parseDisplayName, userId, type UserId } from "@insecur/domain";
import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import { withTenantScope } from "../with-tenant-scope.js";
import type { ActiveUserAdmissionRow, SeedUserAdmissionInput } from "./types.js";

interface UserAdmissionLookupRow {
  user_id: string;
  workos_user_id: string;
  display_name: string | null;
}

function toActiveAdmissionRow(row: UserAdmissionLookupRow): ActiveUserAdmissionRow {
  const parsedDisplayName =
    row.display_name === null
      ? null
      : (() => {
          const parsed = parseDisplayName(row.display_name);
          return parsed.ok ? parsed.value : null;
        })();
  return {
    userId: userId.brand(row.user_id),
    workosUserId: row.workos_user_id,
    displayName: parsedDisplayName,
  };
}

export async function resolveActiveUserAdmission(
  instanceId: string,
  workosUserId: string,
): Promise<ActiveUserAdmissionRow | null> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<UserAdmissionLookupRow[]>`
      SELECT user_id, workos_user_id, display_name
      FROM user_admissions
      WHERE instance_id = ${instanceId}
        AND workos_user_id = ${workosUserId}
        AND status = ${"active"}
      LIMIT 1
    `;
  });
  const row = rows[0];
  return row === undefined ? null : toActiveAdmissionRow(row);
}

export async function resolveAdmittedUserId(
  instanceId: string,
  workosUserId: string,
): Promise<UserId | null> {
  const admission = await resolveActiveUserAdmission(instanceId, workosUserId);
  return admission?.userId ?? null;
}

export interface ResolveAdmissionForEdgeResult {
  readonly userId: UserId | null;
  readonly cliSessionRevoked: boolean;
}

/**
 * Resolves admission and, when a session id is present, whether that CLI session was revoked.
 * One service-scoped round trip so the public edge pays a single pre-auth RPC (INS-472).
 */
export async function resolveAdmissionForEdge(
  instanceId: string,
  workosUserId: string,
  sessionId?: string,
): Promise<ResolveAdmissionForEdgeResult> {
  if (sessionId === undefined) {
    return {
      userId: await resolveAdmittedUserId(instanceId, workosUserId),
      cliSessionRevoked: false,
    };
  }

  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<
      {
        user_id: string | null;
        cli_session_revoked: boolean;
      }[]
    >`
      SELECT
        ua.user_id,
        EXISTS (
          SELECT 1
          FROM revoked_cli_sessions r
          WHERE r.instance_id = ${instanceId}
            AND r.session_id = ${sessionId}
            AND r.session_expires_at > now()
        ) AS cli_session_revoked
      FROM user_admissions ua
      WHERE ua.instance_id = ${instanceId}
        AND ua.workos_user_id = ${workosUserId}
        AND ua.status = ${"active"}
      LIMIT 1
    `;
  });

  const row = rows[0];
  if (row === undefined) {
    return { userId: null, cliSessionRevoked: false };
  }

  return {
    userId: row.user_id === null ? null : userId.brand(row.user_id),
    cliSessionRevoked: row.cli_session_revoked,
  };
}

export async function insertActiveUserAdmissionInTransaction(
  sql: TenantScopedSql,
  input: SeedUserAdmissionInput,
): Promise<void> {
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
      ${input.admissionId},
      ${input.instanceId},
      ${input.userId},
      ${input.workosUserId},
      ${input.displayName ?? null},
      ${"active"}
    )
  `;
}

export async function seedActiveUserAdmission(input: SeedUserAdmissionInput): Promise<void> {
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
        ${input.admissionId},
        ${input.instanceId},
        ${input.userId},
        ${input.workosUserId},
        ${input.displayName ?? null},
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
  });
}

export async function revokeUserAdmission(
  instanceId: string,
  workosUserId: string,
): Promise<UserId | null> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<{ user_id: string }[]>`
      UPDATE user_admissions
      SET
        status = ${"revoked"},
        revoked_at = now(),
        updated_at = now()
      WHERE instance_id = ${instanceId}
        AND workos_user_id = ${workosUserId}
        AND status = ${"active"}
      RETURNING user_id
    `;
  });
  const row = rows[0];
  return row === undefined ? null : userId.brand(row.user_id);
}
