import type { AdmittedUserResolver } from "./admitted-user.js";
import { authFailureForReason, type AuthFailure } from "./auth-failure.js";
import type { ParsedRequestCredentials } from "./credentials.js";
import { verifyEphemeralSessionCredential } from "./ephemeral-session.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type { WorkOSSessionPort } from "./workos-session-port.js";
import type { UserActor } from "./user-actor.js";

export type ResolveUserActorResult =
  | { ok: true; actor: UserActor }
  | { ok: false; failure: AuthFailure };

async function resolveFromWorkOSSession(
  sessionData: string,
  workos: WorkOSSessionPort,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveUserActorResult> {
  const workosResult = await workos.authenticateSealedSession(sessionData);
  if (!workosResult.authenticated) {
    if (workosResult.reason === "missing") {
      return { ok: false, failure: authFailureForReason("missing") };
    }
    if (workosResult.reason === "expired") {
      return { ok: false, failure: authFailureForReason("expired") };
    }
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  const userId = await resolveAdmittedUser(workosResult.user.id);
  if (userId === null) {
    return { ok: false, failure: authFailureForReason("not_admitted") };
  }
  return {
    ok: true,
    actor: {
      type: "user",
      userId,
      workosUserId: workosResult.user.id,
      sessionId: workosResult.sessionId,
    },
  };
}

export interface ResolveUserActorInput {
  readonly credentials: ParsedRequestCredentials;
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
}

export async function resolveUserActor(
  input: ResolveUserActorInput,
): Promise<ResolveUserActorResult> {
  const { bearerCredential, workosSealedSession } = input.credentials;

  if (bearerCredential !== undefined) {
    const verified = await verifyEphemeralSessionCredential(
      bearerCredential,
      input.config.sessionSigningSecret,
    );
    if (!verified.ok) {
      const reason = verified.reason === "expired" ? "expired" : "invalid";
      return { ok: false, failure: authFailureForReason(reason) };
    }
    const admitted = await input.resolveAdmittedUser(verified.actor.workosUserId);
    if (admitted === null) {
      return { ok: false, failure: authFailureForReason("not_admitted") };
    }
    if (admitted !== verified.actor.userId) {
      return { ok: false, failure: authFailureForReason("invalid") };
    }
    return { ok: true, actor: verified.actor };
  }

  if (workosSealedSession !== undefined) {
    return resolveFromWorkOSSession(workosSealedSession, input.workos, input.resolveAdmittedUser);
  }

  return { ok: false, failure: authFailureForReason("missing") };
}
