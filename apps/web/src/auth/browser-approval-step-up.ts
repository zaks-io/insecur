import { authFailureForReason, type AuthFailure } from "@insecur/auth";
import { isKnownErrorCodeInCatalog } from "@insecur/domain";
import { authenticateBrowserWorkOSSession } from "./browser-session-auth.js";
import { oauthCallbackUrl, readPkceOAuthCallback } from "./browser-oauth-common.js";
import {
  createOAuthState,
  createPkcePair,
  createPkceAuthorizationStart,
  formatPkceStateClearCookie,
  normalizeReturnTo,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";
import { resolveAuthenticatedApiClient } from "../server/bff-api.js";
import type { WebEnv } from "../env.js";

const DEFAULT_RETURN_TO = "/orgs";

export interface BrowserApprovalStepUpStart {
  readonly authorizationUrl: string;
  readonly setCookieHeaders: readonly string[];
}

export type BrowserApprovalStepUpCompleteResult =
  | { ok: true; readonly redirectTo: string }
  | { ok: false; failure: AuthFailure }
  | { ok: false; readonly code: string };

function requiredQueryParam(url: URL, name: string): string | null {
  const value = url.searchParams.get(name);
  return value === null || value === "" ? null : value;
}

interface ApprovalStepUpQueryParams {
  readonly organizationId: string;
  readonly approvalRequestId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly impactReviewFingerprint: string;
  readonly returnTo: string;
}

function readApprovalStepUpQueryParams(url: URL): ApprovalStepUpQueryParams | null {
  const organizationId = requiredQueryParam(url, "organizationId");
  const approvalRequestId = requiredQueryParam(url, "approvalRequestId");
  const projectId = requiredQueryParam(url, "projectId");
  const environmentId = requiredQueryParam(url, "environmentId");
  const impactReviewFingerprint = requiredQueryParam(url, "impactReviewFingerprint");
  if (
    organizationId === null ||
    approvalRequestId === null ||
    projectId === null ||
    environmentId === null ||
    impactReviewFingerprint === null
  ) {
    return null;
  }
  return {
    organizationId,
    approvalRequestId,
    projectId,
    environmentId,
    impactReviewFingerprint,
    returnTo: normalizeReturnTo(url.searchParams.get("returnTo"), DEFAULT_RETURN_TO),
  };
}

function buildApprovalStepUpRoundTrip(
  workosUserId: string,
  params: ApprovalStepUpQueryParams,
  state: string,
  codeVerifier: string,
): PkceRoundTrip {
  return {
    state,
    codeVerifier,
    returnTo: params.returnTo,
    workosUserId,
    flow: "approval-step-up",
    approvalStepUp: {
      organizationId: params.organizationId,
      approvalRequestId: params.approvalRequestId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      impactReviewFingerprint: params.impactReviewFingerprint,
    },
  };
}

/**
 * Starts WorkOS AuthKit step-up for Approval Request approve. Fresh passkey/TOTP evidence is
 * exchanged server-side; the browser never supplies factor authority (ADR-0032).
 */
export async function beginBrowserApprovalStepUp(
  request: Request,
  env: WebEnv,
): Promise<BrowserApprovalStepUpStart | { ok: false; failure: AuthFailure }> {
  const session = await authenticateBrowserWorkOSSession(request, env);
  if (!session.ok) {
    return session;
  }

  const params = readApprovalStepUpQueryParams(new URL(request.url));
  if (params === null) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  const pkce = await createPkcePair();
  const state = createOAuthState();
  const roundTrip = buildApprovalStepUpRoundTrip(
    session.workosUserId,
    params,
    state,
    pkce.verifier,
  );
  const authorizationUrl = session.workos.createAuthorizationUrl({
    redirectUri: oauthCallbackUrl(request, "/auth/approval-step-up/callback"),
    state,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: "S256",
    screenHint: "sign-in",
    ...(session.loginHint === undefined ? {} : { loginHint: session.loginHint }),
    maxAge: 0,
  });
  return createPkceAuthorizationStart(authorizationUrl, roundTrip);
}

function errorCodeFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const error = (body as { error?: { code?: string } }).error;
  const code = error?.code;
  return typeof code === "string" && isKnownErrorCodeInCatalog(code) ? code : null;
}

function parseApproveOutcome(body: unknown, returnTo: string): BrowserApprovalStepUpCompleteResult {
  if (typeof body === "object" && body !== null && (body as { ok?: boolean }).ok === true) {
    return { ok: true, redirectTo: returnTo };
  }
  const code = errorCodeFromBody(body);
  return code === null ? { ok: false, code: "web.unexpected_response" } : { ok: false, code };
}

export async function completeBrowserApprovalStepUp(
  request: Request,
): Promise<BrowserApprovalStepUpCompleteResult> {
  const callback = readPkceOAuthCallback(
    request,
    (roundTrip) => roundTrip.flow === "approval-step-up",
  );
  if (callback?.roundTrip.approvalStepUp === undefined) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  const client = await resolveAuthenticatedApiClient();
  if (client === null) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const stepUp = callback.roundTrip.approvalStepUp;
  const response = await client.api.approveOrgApprovalRequest(
    stepUp.organizationId,
    stepUp.approvalRequestId,
    {
      projectId: stepUp.projectId,
      environmentId: stepUp.environmentId,
      impactReviewFingerprint: stepUp.impactReviewFingerprint,
      stepUpCode: callback.code,
      stepUpCodeVerifier: callback.roundTrip.codeVerifier,
    },
  );
  return parseApproveOutcome(response, callback.roundTrip.returnTo);
}

export function approvalStepUpFailureRedirectPath(returnTo: string): string {
  const url = new URL(returnTo, "https://insecur.invalid");
  url.searchParams.set("approve", "failed");
  return `${url.pathname}${url.search}`;
}

export function resolveApprovalStepUpFailureRedirect(request: Request): string {
  const callback = readPkceOAuthCallback(
    request,
    (roundTrip) => roundTrip.flow === "approval-step-up",
  );
  return approvalStepUpFailureRedirectPath(callback?.roundTrip.returnTo ?? DEFAULT_RETURN_TO);
}

export function approvalStepUpClearCookieHeader(): string {
  return formatPkceStateClearCookie();
}
