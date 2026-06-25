import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

type HmacSigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function importHmacSigningKey(secret: string): Promise<HmacSigningKey> {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export function encodeHs256Jwt(
  payload: Record<string, unknown>,
  signingSecret: string,
): Promise<string> {
  return signHs256Payload(payload, signingSecret);
}

async function signHs256Payload(
  payload: Record<string, unknown>,
  signingSecret: string,
): Promise<string> {
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const key = await importHmacSigningKey(signingSecret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export function parseHs256JwtParts(
  token: string,
): { signingInput: string; body: string; signature: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const header = parts[0];
  const body = parts[1];
  const signature = parts[2];
  if (header === undefined || body === undefined || signature === undefined) {
    return null;
  }
  return { signingInput: `${header}.${body}`, body, signature };
}

export async function verifyHs256JwtSignature(
  signingInput: string,
  signature: string,
  signingSecret: string,
): Promise<boolean> {
  const signatureBytes = base64UrlToBytes(signature);
  if (signatureBytes === null) {
    return false;
  }
  const key = await importHmacSigningKey(signingSecret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(signingInput),
  );
}

export function decodeHs256JwtBody(body: string): Record<string, unknown> | null {
  const bodyBytes = base64UrlToBytes(body);
  if (bodyBytes === null) {
    return null;
  }
  try {
    const decoded = new TextDecoder().decode(bodyBytes);
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
