import type { RequestId } from "@insecur/domain";

export interface PostAuthRpcInputBase {
  /** Scoped, audience-bound hop token authenticating the forwarded actor (ADR-0077). */
  readonly actorToken: string;
  /** API-minted request id, threaded into the Runtime audit rows. */
  readonly requestId: RequestId;
}
