import { revokeCliSession } from "@insecur/tenant-store";
import type { UserActor } from "@insecur/auth";
import type { RevokeCliSessionRpcPayload } from "@insecur/worker-kit";

export interface RevokeCliSessionOperationInput {
  readonly instanceId: string;
  readonly actor: UserActor;
  readonly sessionExpiresAt: string;
}

/**
 * Revokes only the calling actor's own CLI session. The session id comes from the verified hop
 * token, so callers cannot revoke another user's session.
 */
export async function revokeCliSessionOperation({
  instanceId,
  actor,
  sessionExpiresAt,
}: RevokeCliSessionOperationInput): Promise<RevokeCliSessionRpcPayload> {
  return revokeCliSession(instanceId, actor.sessionId, actor.userId, sessionExpiresAt);
}
