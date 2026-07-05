import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

export const INSECUR_OAUTH_PKCE_COOKIE = "insecur_oauth_pkce";
const OAUTH_PKCE_TTL_SECONDS = 600;

export interface PkceRoundTrip {
  readonly state: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
}

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

function isRelativeAppPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function parsePkceRoundTripPayload(parsed: Partial<PkceRoundTrip>): PkceRoundTrip | null {
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
