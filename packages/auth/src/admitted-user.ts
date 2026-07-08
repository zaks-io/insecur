import type { UserId } from "@insecur/domain";

export interface AdmittedUserResolveContext {
  readonly sessionId: string;
}

/** Returned when the session id was explicitly revoked via `insecur logout`. */
export type AdmittedUserCliSessionRevoked = "cli_session_revoked";

/** Maps a WorkOS user id to an admitted insecur User id, or null when not admitted. */
export type AdmittedUserResolver = (
  workosUserId: string,
  context?: AdmittedUserResolveContext,
) => Promise<UserId | null | AdmittedUserCliSessionRevoked>;
