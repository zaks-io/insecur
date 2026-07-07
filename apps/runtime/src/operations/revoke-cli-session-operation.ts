import { isCliSessionRevoked, revokeCliSession } from "@insecur/tenant-store";
import type { UserActor } from "@insecur/auth";
import type {
  IsCliSessionRevokedRpcPayload,
  RevokeCliSessionRpcPayload,
} from "@insecur/worker-kit";

export interface RevokeCliSessionOperationInput {
  readonly instanceId: string;
  readonly actor: UserActor;
}

/**
 * Revokes only the calling actor's own CLI session. The session id comes from the verified hop
 * token, so callers cannot revoke another user's session.
 */
export async function revokeCliSessionOperation({
  instanceId,
  actor,
}: RevokeCliSessionOperationInput): Promise<RevokeCliSessionRpcPayload> {
  return revokeCliSession(instanceId, actor.sessionId, actor.userId);
}

export async function isCliSessionRevokedOperation(input: {
  readonly instanceId: string;
  readonly sessionId: string;
}): Promise<IsCliSessionRevokedRpcPayload> {
  return { revoked: await isCliSessionRevoked(input.instanceId, input.sessionId) };
}
