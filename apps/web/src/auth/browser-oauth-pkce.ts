import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

import {
  buildPkceRoundTrip,
  isValidPkceFlow,
  parseOptionalApprovalStepUp,
  parseOptionalChallengeClear,
  validateApprovalStepUpForFlow,
  validateChallengeClearForFlow,
  type ChallengeClearStepUpContext,
  type PkceRoundTrip,
} from "./browser-oauth-pkce-flow.js";

export type { ChallengeClearStepUpContext, PkceRoundTrip };

export const INSECUR_OAUTH_PKCE_COOKIE = "insecur_oauth_pkce";
const OAUTH_PKCE_TTL_SECONDS = 600;

export async function createPkcePair(): Promise<{
  readonly verifier: string;
  readonly challenge: string;
}> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = bytesToBase64Url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function encodePkceRoundTrip(roundTrip: PkceRoundTrip): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(roundTrip)));
}

export function createPkceAuthorizationStart(
  authorizationUrl: string,
  roundTrip: PkceRoundTrip,
): {
  readonly authorizationUrl: string;
  readonly setCookieHeaders: readonly string[];
} {
  return {
    authorizationUrl,
    setCookieHeaders: [formatPkceStateCookie(encodePkceRoundTrip(roundTrip))],
  };
}

const RELATIVE_APP_PATH_BASE = "https://insecur.invalid";

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isRelativeAppPath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return false;
  }
  let resolved: URL;
  try {
    resolved = new URL(value, RELATIVE_APP_PATH_BASE);
  } catch {
    return false;
  }
  return resolved.origin === RELATIVE_APP_PATH_BASE;
}

function parsePkceStringFields(
  parsed: Partial<PkceRoundTrip>,
): Pick<PkceRoundTrip, "state" | "codeVerifier" | "returnTo"> | null {
  if (
    typeof parsed.state !== "string" ||
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.returnTo !== "string" ||
    !isRelativeAppPath(parsed.returnTo)
  ) {
    return null;
  }
  return {
    state: parsed.state,
    codeVerifier: parsed.codeVerifier,
    returnTo: parsed.returnTo,
  };
}

function attachFlowSpecificFields(
  core: Pick<PkceRoundTrip, "state" | "codeVerifier" | "returnTo">,
  parsed: Partial<PkceRoundTrip>,
): PkceRoundTrip | null {
  if (!isValidPkceFlow(parsed.flow)) {
    return null;
  }
  if (parsed.workosUserId !== undefined && typeof parsed.workosUserId !== "string") {
    return null;
  }
  const challengeClear = parseOptionalChallengeClear(parsed.challengeClear);
  if (!validateChallengeClearForFlow(parsed.flow, challengeClear)) {
    return null;
  }
  const approvalStepUp = parseOptionalApprovalStepUp(parsed.approvalStepUp);
  if (!validateApprovalStepUpForFlow(parsed.flow, approvalStepUp)) {
    return null;
  }
  return buildPkceRoundTrip(core, parsed, challengeClear, approvalStepUp);
}

function parsePkceRoundTripPayload(parsed: Partial<PkceRoundTrip>): PkceRoundTrip | null {
  const core = parsePkceStringFields(parsed);
  if (core === null) {
    return null;
  }
  return attachFlowSpecificFields(core, parsed);
}

export function decodePkceRoundTrip(value: string | undefined): PkceRoundTrip | null {
  if (!value) {
    return null;
  }
  const bytes = base64UrlToBytes(value);
  if (bytes === null) {
    return null;
  }
  try {
    return parsePkceRoundTripPayload(
      JSON.parse(new TextDecoder().decode(bytes)) as Partial<PkceRoundTrip>,
    );
  } catch {
    return null;
  }
}

export function formatPkceStateCookie(value: string): string {
  return [
    `${INSECUR_OAUTH_PKCE_COOKIE}=${value}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    "Secure",
    `Max-Age=${String(OAUTH_PKCE_TTL_SECONDS)}`,
  ].join("; ");
}

export function formatPkceStateClearCookie(): string {
  return [
    `${INSECUR_OAUTH_PKCE_COOKIE}=`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    "Secure",
    "Max-Age=0",
  ].join("; ");
}

export function normalizeReturnTo(value: string | null, defaultReturnTo: string): string {
  if (value === null || value === "" || !isRelativeAppPath(value)) {
    return defaultReturnTo;
  }
  return value;
}
