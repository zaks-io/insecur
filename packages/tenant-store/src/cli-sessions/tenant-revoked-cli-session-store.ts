import type { UserId } from "@insecur/domain";
import { withTenantScope } from "../with-tenant-scope.js";

export async function revokeCliSession(
  instanceId: string,
  sessionId: string,
  userId: UserId,
  sessionExpiresAt: string,
): Promise<{ readonly revoked: boolean }> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<{ session_id: string }[]>`
      WITH inserted AS (
        INSERT INTO revoked_cli_sessions (
          instance_id,
          session_id,
          user_id,
          session_expires_at
        )
        VALUES (${instanceId}, ${sessionId}, ${userId}, ${sessionExpiresAt})
        ON CONFLICT (instance_id, session_id) DO NOTHING
        RETURNING session_id
      )
      SELECT session_id FROM inserted
      UNION ALL
      SELECT session_id
      FROM revoked_cli_sessions
      WHERE instance_id = ${instanceId}
        AND session_id = ${sessionId}
      LIMIT 1
    `;
  });
  await pruneExpiredRevokedCliSessions(instanceId);
  return { revoked: rows.length > 0 };
}

export async function isCliSessionRevoked(instanceId: string, sessionId: string): Promise<boolean> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<{ session_id: string }[]>`
      SELECT session_id
      FROM revoked_cli_sessions
      WHERE instance_id = ${instanceId}
        AND session_id = ${sessionId}
        AND session_expires_at > now()
      LIMIT 1
    `;
  });
  return rows.length > 0;
}

/** Deletes revocation rows whose credential lifetime has ended and can no longer matter. */
export async function pruneExpiredRevokedCliSessions(instanceId?: string): Promise<number> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    if (instanceId === undefined) {
      return await sql<{ session_id: string }[]>`
        DELETE FROM revoked_cli_sessions
        WHERE session_expires_at <= now()
        RETURNING session_id
      `;
    }
    return await sql<{ session_id: string }[]>`
      DELETE FROM revoked_cli_sessions
      WHERE instance_id = ${instanceId}
        AND session_expires_at <= now()
      RETURNING session_id
    `;
  });
  return rows.length;
}
