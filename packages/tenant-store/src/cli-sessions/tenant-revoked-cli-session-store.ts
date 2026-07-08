import type { UserId } from "@insecur/domain";
import { withTenantScope } from "../with-tenant-scope.js";

export async function revokeCliSession(
  instanceId: string,
  sessionId: string,
  userId: UserId,
): Promise<{ readonly revoked: boolean }> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<{ session_id: string }[]>`
      WITH inserted AS (
        INSERT INTO revoked_cli_sessions (instance_id, session_id, user_id)
        VALUES (${instanceId}, ${sessionId}, ${userId})
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
  return { revoked: rows.length > 0 };
}

export async function isCliSessionRevoked(instanceId: string, sessionId: string): Promise<boolean> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<{ session_id: string }[]>`
      SELECT session_id
      FROM revoked_cli_sessions
      WHERE instance_id = ${instanceId}
        AND session_id = ${sessionId}
      LIMIT 1
    `;
  });
  return rows.length > 0;
}
