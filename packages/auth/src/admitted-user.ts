import type { UserId } from "@insecur/domain";

/** Maps a WorkOS user id to an admitted insecur User id, or null when not admitted. */
export type AdmittedUserResolver = (workosUserId: string) => Promise<UserId | null>;
