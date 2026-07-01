import {
  authenticateWorkOSSession,
  authFailureForAdmissionDenial,
  authFailureForReason,
  INSECUR_CSRF_HEADER,
  parseRequestCredentials,
  type ResolveUserActorResult,
  WORKOS_SESSION_COOKIE,
} from "@insecur/auth";
import { requestId } from "@insecur/domain";
import { recordAdmissionDeniedAuditForAuthFailure } from "@insecur/worker-kit/record-admission-denied-audit";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import { createRuntimeAdmittedUserResolver } from "../runtime/admission.js";
import type { WebEnv } from "../env.js";

/**
 * Resolve the admitted human actor from the browser's WorkOS sealed session cookie.
 * The BFF never forwards browser session material to the API; it mints a scoped hop token instead.
 */
export async function resolveBrowserActor(
  request: Request,
  env: WebEnv,
): Promise<ResolveUserActorResult> {
  const credentials = parseRequestCredentials({
    authorizationHeader: null,
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get(INSECUR_CSRF_HEADER) ?? undefined,
  });
  if (credentials.workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const workos = createWorkOSSessionPortFromEnv(env);
  const resolveAdmittedUser = createRuntimeAdmittedUserResolver(env);
  const session = await authenticateWorkOSSession(workos, credentials.workosSealedSession);
  if (!session.ok) {
    return { ok: false, failure: session.failure };
  }

  const admittedUserId = await resolveAdmittedUser(session.context.user.id);
  if (admittedUserId === null) {
    const failure = authFailureForAdmissionDenial(session.context.user.id);
    await recordAdmissionDeniedAuditForAuthFailure(env, failure, requestId.generate());
    return { ok: false, failure };
  }

  return {
    ok: true,
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId: session.context.user.id,
      sessionId: session.context.sessionId,
    },
  };
}

export function hasWorkosSessionCookie(request: Request): boolean {
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader === null) {
    return false;
  }
  return cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith(`${WORKOS_SESSION_COOKIE}=`));
}
