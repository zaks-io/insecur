import type { UserActor } from "@insecur/auth";
import { BOOTSTRAP_ERROR_CODES } from "@insecur/domain";
import { BootstrapError } from "./bootstrap-error.js";

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Bootstrap Operator Claim completion requires a WorkOS-authenticated human actor.
 * Callers must resolve {@link UserActor} from session context (INS-25), not pass a bare user id.
 */
export function assertAuthenticatedBootstrapActor(actor: UserActor): void {
  if (
    !hasNonEmptyString(actor.userId) ||
    !hasNonEmptyString(actor.workosUserId) ||
    !hasNonEmptyString(actor.sessionId)
  ) {
    throw new BootstrapError(
      BOOTSTRAP_ERROR_CODES.authenticatedActorRequired,
      "bootstrap operator claim requires an authenticated human identity provider actor",
    );
  }
}
