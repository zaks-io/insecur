import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

type Rs256PublicKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export interface JwkPublicKey {
  readonly kid: string;
  readonly alg: "RS256";
  readonly publicKey: Rs256PublicKey;
}

export interface JwtHeader {
  readonly alg: string;
  readonly typ?: string;
  readonly kid?: string;
}

export type VerifyRs256JwtResult =
  | { ok: true; payload: Record<string, unknown> }
  | {
      ok: false;
      reason: "malformed" | "unsupported_alg" | "invalid_signature" | "invalid_payload";
    };

interface JwtSegments {
  readonly headerSegment: string;
  readonly payloadSegment: string;
  readonly signatureSegment: string;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(segment);
  if (bytes === null) {
    return null;
  }
  try {
    const decoded = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseJwtHeader(headerSegment: string): JwtHeader | null {
  const header = decodeJsonSegment(headerSegment);
  if (header === null || typeof header.alg !== "string") {
    return null;
  }
  return {
    alg: header.alg,
    ...(typeof header.typ === "string" ? { typ: header.typ } : {}),
    ...(typeof header.kid === "string" ? { kid: header.kid } : {}),
  };
}

function parseJwtSegments(token: string): JwtSegments | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const headerSegment = parts[0];
  const payloadSegment = parts[1];
  const signatureSegment = parts[2];
  if (
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signatureSegment === undefined
  ) {
    return null;
  }
  return { headerSegment, payloadSegment, signatureSegment };
}

async function verifyRs256Signature(segments: JwtSegments, key: JwkPublicKey): Promise<boolean> {
  const signatureBytes = base64UrlToBytes(segments.signatureSegment);
  if (signatureBytes === null) {
    return false;
  }
  const signingInput = new TextEncoder().encode(
    `${segments.headerSegment}.${segments.payloadSegment}`,
  );
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key.publicKey,
    signatureBytes as BufferSource,
    signingInput,
  );
}

function rs256HeaderFailure(header: JwtHeader | null): VerifyRs256JwtResult | null {
  if (header === null) {
    return { ok: false, reason: "malformed" };
  }
  if (header.alg !== "RS256" || header.kid === undefined) {
    return { ok: false, reason: "unsupported_alg" };
  }
  return null;
}

/**
 * Verifies an RS256 JWT signature using the supplied JWK public key set.
 */
export async function verifyRs256Jwt(
  token: string,
  keys: readonly JwkPublicKey[],
): Promise<VerifyRs256JwtResult> {
  const segments = parseJwtSegments(token);
  if (segments === null) {
    return { ok: false, reason: "malformed" };
  }

  const header = parseJwtHeader(segments.headerSegment);
  const headerFailure = rs256HeaderFailure(header);
  if (headerFailure !== null) {
    return headerFailure;
  }

  const kid = header?.kid;
  const key = keys.find((candidate) => candidate.kid === kid);
  if (key === undefined || !(await verifyRs256Signature(segments, key))) {
    return { ok: false, reason: "invalid_signature" };
  }

  const payload = decodeJsonSegment(segments.payloadSegment);
  return payload === null ? { ok: false, reason: "invalid_payload" } : { ok: true, payload };
}

export async function importRs256PublicKeyFromJwk(
  jwk: Record<string, unknown>,
): Promise<JwkPublicKey | null> {
  const kid = jwk.kid;
  const kty = jwk.kty;
  const n = jwk.n;
  const e = jwk.e;
  if (typeof kid !== "string" || kty !== "RSA" || typeof n !== "string" || typeof e !== "string") {
    return null;
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n, e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return { kid, alg: "RS256", publicKey };
  } catch {
    return null;
  }
}

export function encodeUnsignedJwtPayload(payload: Record<string, unknown>): string {
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${header}.${body}`;
}
