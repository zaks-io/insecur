import {
  type AdmittedUserResolver,
  authenticateWorkOSSession,
  authFailureForAdmissionDenial,
  authFailureForReason,
  INSECUR_CSRF_HEADER,
  parseRequestCredentials,
  type ResolveUserActorResult,
  type UserActor,
  verifyEphemeralSessionCredential,
  WORKOS_SESSION_COOKIE,
} from "@insecur/auth";
import { requestId } from "@insecur/domain";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import {
  createRuntimeAdmittedUserResolver,
  recordAdmissionDeniedAuditForAuthFailure,
} from "../runtime/admission.js";
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
    authorizationHeader: request.headers.get("Authorization"),
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get(INSECUR_CSRF_HEADER) ?? undefined,
  });
  const resolveAdmittedUser = createRuntimeAdmittedUserResolver(env);
  if (credentials.bearerCredential !== undefined && acceptsPreviewSmokeCredentials(env)) {
    return resolvePreviewSmokeActor(credentials.bearerCredential, env, resolveAdmittedUser);
  }
  return resolveWorkosCookieActor(credentials.workosSealedSession, env, resolveAdmittedUser);
}

async function resolveWorkosCookieActor(
  workosSealedSession: string | undefined,
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveUserActorResult> {
  if (workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const workos = createWorkOSSessionPortFromEnv(env);
  const session = await authenticateWorkOSSession(workos, workosSealedSession);
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

function acceptsPreviewSmokeCredentials(env: WebEnv): boolean {
  return env.PREVIEW_SMOKE_SESSION_CREDENTIALS === "true";
}

async function resolvePreviewSmokeActor(
  credential: string,
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveUserActorResult> {
  const verified = await verifyEphemeralSessionCredential(credential, env.SESSION_SIGNING_SECRET);
  if (!verified.ok) {
    return {
      ok: false,
      failure: authFailureForReason(verified.reason === "expired" ? "expired" : "invalid"),
    };
  }
  return resolveAdmittedActor(verified.actor, env, resolveAdmittedUser);
}

async function resolveAdmittedActor(
  actor: UserActor,
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveUserActorResult> {
  const admittedUserId = await resolveAdmittedUser(actor.workosUserId);
  if (admittedUserId === null) {
    const failure = authFailureForAdmissionDenial(actor.workosUserId);
    await recordAdmissionDeniedAuditForAuthFailure(env, failure, requestId.generate());
    return { ok: false, failure };
  }
  if (admittedUserId !== actor.userId) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  return { ok: true, actor };
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
