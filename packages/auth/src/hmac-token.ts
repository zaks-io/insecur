import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function importSigningKey(secret: string): Promise<SigningKey> {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function signPayload(payloadJson: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const data = new TextEncoder().encode(payloadJson);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(
  payloadJson: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const signatureBytes = base64UrlToBytes(signature);
  if (signatureBytes === null) {
    return false;
  }
  const key = await importSigningKey(secret);
  const data = new TextEncoder().encode(payloadJson);
  return crypto.subtle.verify("HMAC", key, signatureBytes, data);
}

/** Encode a payload object as a signed `header.body.signature` HS256-shaped token. */
export async function encodeHmacToken(payload: object, signingSecret: string): Promise<string> {
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = await signPayload(signingInput, signingSecret);
  return `${signingInput}.${signature}`;
}

/** A signature-verified token payload: a plain JSON object whose claims are not yet validated. */
export type TokenClaims = Readonly<Record<string, unknown>>;

/**
 * Verify the signature and decode the payload of an HMAC token, or null if the token is
 * malformed or the signature does not match. The caller validates the concrete `typ`/`aud`/`exp`
 * claims; a verified signature alone does not authorize anything.
 */
export async function decodeHmacToken(
  token: string,
  signingSecret: string,
): Promise<TokenClaims | null> {
  const parts = parseTokenParts(token);
  if (parts === null) {
    return null;
  }
  const signatureValid = await verifySignature(parts.signingInput, parts.signature, signingSecret);
  if (!signatureValid) {
    return null;
  }
  return parsePayload(parts.body);
}

function parseTokenParts(
  token: string,
): { signingInput: string; body: string; signature: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts;
  if (header === undefined || body === undefined || signature === undefined) {
    return null;
  }
  return { signingInput: `${header}.${body}`, body, signature };
}

function parsePayload(body: string): TokenClaims | null {
  const bodyBytes = base64UrlToBytes(body);
  if (bodyBytes === null) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bodyBytes));
    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }
    return decoded as TokenClaims;
  } catch {
    return null;
  }
}
