import {
  type AdmittedUserResolver,
  authFailureForAdmissionDenial,
  authFailureForReason,
  authenticateWorkOSSession,
  generateCsrfToken,
  INSECUR_CSRF_HEADER,
  parseRequestCredentials,
  refreshWorkOSSession,
  type AuthFailure,
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
import { applyBrowserSessionFromResolveResult } from "./session-headers.js";
import type { WebEnv } from "../env.js";

export interface BrowserSessionRotation {
  readonly sealedSession: string;
  readonly csrfToken: string;
}

export type ResolveBrowserActorResult =
  | { ok: true; actor: UserActor; rotation?: BrowserSessionRotation }
  | { ok: false; failure: AuthFailure; clearSession?: boolean };

const browserActorResolutionByRequest = new WeakMap<Request, Promise<ResolveBrowserActorResult>>();

/**
 * Resolve the admitted human actor from the browser's WorkOS sealed session cookie.
 * The BFF never forwards browser session material to the API; it mints a scoped hop token instead.
 */
export async function resolveBrowserActor(
  request: Request,
  env: WebEnv,
): Promise<ResolveBrowserActorResult> {
  const inflight = browserActorResolutionByRequest.get(request);
  if (inflight !== undefined) {
    return inflight;
  }

  const resolution = resolveBrowserActorUncached(request, env).then(finalizeBrowserActorResult);
  browserActorResolutionByRequest.set(request, resolution);
  return resolution;
}

async function resolveBrowserActorUncached(
  request: Request,
  env: WebEnv,
): Promise<ResolveBrowserActorResult> {
  const credentials = parseRequestCredentials({
    authorizationHeader: request.headers.get("Authorization"),
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get(INSECUR_CSRF_HEADER) ?? undefined,
  });
  const resolveAdmittedUser = createRuntimeAdmittedUserResolver(env);
  if (credentials.bearerCredential !== undefined && acceptsPreviewSmokeCredentials(env)) {
    const smokeResult = await resolvePreviewSmokeActor(
      credentials.bearerCredential,
      env,
      resolveAdmittedUser,
    );
    if (shouldUseSmokeResult(smokeResult, credentials.workosSealedSession)) {
      return smokeResult;
    }
  }
  return resolveWorkosCookieActor(credentials.workosSealedSession, env, resolveAdmittedUser);
}

function finalizeBrowserActorResult(result: ResolveBrowserActorResult): ResolveBrowserActorResult {
  applyBrowserSessionFromResolveResult(result);
  return result;
}

function postRefreshBrowserActorFailure(failure: AuthFailure): ResolveBrowserActorResult {
  const result: ResolveBrowserActorResult = { ok: false, failure, clearSession: true };
  applyBrowserSessionFromResolveResult(result);
  return result;
}

function workosContextUserActor(
  admittedUserId: UserActor["userId"],
  context: { readonly user: { readonly id: string }; readonly sessionId: string },
): UserActor {
  return {
    type: "user",
    userId: admittedUserId,
    workosUserId: context.user.id,
    sessionId: context.sessionId,
  };
}

async function recordWorkosAdmissionDenial(
  env: WebEnv,
  workosUserId: string,
): Promise<AuthFailure> {
  const failure = authFailureForAdmissionDenial(workosUserId);
  try {
    await recordAdmissionDeniedAuditForAuthFailure(env, failure, requestId.generate());
  } catch {
    // Admission audit must not block post-refresh cookie clearing.
  }
  return failure;
}

function shouldUseSmokeResult(
  smokeResult: ResolveBrowserActorResult,
  workosSealedSession: string | undefined,
): boolean {
  if (smokeResult.ok || workosSealedSession === undefined) {
    return true;
  }
  return !["expired", "invalid"].includes(smokeResult.failure.reason);
}

async function resolveWorkosCookieActor(
  workosSealedSession: string | undefined,
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveBrowserActorResult> {
  if (workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const workos = createWorkOSSessionPortFromEnv(env);
  const session = await authenticateWorkOSSession(workos, workosSealedSession);
  if (!session.ok) {
    if (session.failure.reason !== "expired") {
      return { ok: false, failure: session.failure };
    }
    const refreshed = await refreshWorkOSSession(workos, workosSealedSession);
    if (!refreshed.ok) {
      return postRefreshBrowserActorFailure(refreshed.failure);
    }
    return resolveAdmittedWorkosContextAfterRefresh(
      refreshed.rotated.context,
      refreshed.rotated.sealedSession,
      env,
      resolveAdmittedUser,
    );
  }

  return resolveAdmittedWorkosContext(session.context, env, resolveAdmittedUser);
}

async function resolveAdmittedWorkosContextAfterRefresh(
  context: { readonly user: { readonly id: string }; readonly sessionId: string },
  rotatedSealedSession: string,
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveBrowserActorResult> {
  const admittedUserId = await resolveAdmittedUser(context.user.id);
  if (admittedUserId === null) {
    return postRefreshBrowserActorFailure(await recordWorkosAdmissionDenial(env, context.user.id));
  }

  return {
    ok: true,
    actor: workosContextUserActor(admittedUserId, context),
    rotation: {
      sealedSession: rotatedSealedSession,
      csrfToken: generateCsrfToken(),
    },
  };
}

async function resolveAdmittedWorkosContext(
  context: { readonly user: { readonly id: string }; readonly sessionId: string },
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveBrowserActorResult> {
  return resolveAdmittedActorFromWorkosContext(context, env, resolveAdmittedUser);
}

async function resolveAdmittedActorFromWorkosContext(
  context: { readonly user: { readonly id: string }; readonly sessionId: string },
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<{ ok: true; actor: UserActor } | { ok: false; failure: AuthFailure }> {
  const admittedUserId = await resolveAdmittedUser(context.user.id);
  if (admittedUserId === null) {
    return {
      ok: false,
      failure: await recordWorkosAdmissionDenial(env, context.user.id),
    };
  }

  return {
    ok: true,
    actor: workosContextUserActor(admittedUserId, context),
  };
}

function acceptsPreviewSmokeCredentials(env: WebEnv): boolean {
  return env.PREVIEW_SMOKE_SESSION_CREDENTIALS === "true";
}

async function resolvePreviewSmokeActor(
  credential: string,
  env: WebEnv,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveBrowserActorResult> {
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
): Promise<ResolveBrowserActorResult> {
  const admittedUserId = await resolveAdmittedUser(actor.workosUserId);
  if (admittedUserId === null) {
    return {
      ok: false,
      failure: await recordWorkosAdmissionDenial(env, actor.workosUserId),
    };
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
