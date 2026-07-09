import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** A signature-verified token payload: a plain JSON object whose claims are not yet validated. */
export type SignedHs256Payload = Readonly<Record<string, unknown>>;

export interface SignedHs256TokenParts {
  readonly signingInput: string;
  readonly body: string;
  readonly signature: string;
}

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

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.values(value).every(isPlainJsonValue);
}

function isJsonPrimitive(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return false;
}

function isPlainJsonValue(value: unknown): boolean {
  if (isJsonPrimitive(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPlainJsonValue);
  }
  return isPlainJsonObject(value);
}

function assertPlainJsonObjectPayload(payload: object): asserts payload is Record<string, unknown> {
  if (!isPlainJsonObject(payload)) {
    throw new Error("Invalid signed HS256 payload");
  }
}

/** Encode a payload object as a signed `header.body.signature` HS256-shaped token. */
export async function encodeSignedHs256Token(
  payload: object,
  signingSecret: string,
): Promise<string> {
  assertPlainJsonObjectPayload(payload);
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = await signPayload(signingInput, signingSecret);
  return `${signingInput}.${signature}`;
}

/** Split a token into signing input, body, and signature, or null when structure is invalid. */
export function parseSignedHs256TokenParts(token: string): SignedHs256TokenParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts as [string, string, string];
  return { signingInput: `${header}.${body}`, body, signature };
}

/** Verify the HMAC signature for a token signing input. */
export async function verifySignedHs256Signature(
  signingInput: string,
  signature: string,
  signingSecret: string,
): Promise<boolean> {
  const signatureBytes = base64UrlToBytes(signature);
  if (signatureBytes === null) {
    return false;
  }
  const key = await importSigningKey(signingSecret);
  const data = new TextEncoder().encode(signingInput);
  return crypto.subtle.verify("HMAC", key, signatureBytes as BufferSource, data);
}

/** Decode a base64url token body into a JSON object payload, or null when malformed. */
export function decodeSignedHs256PayloadBody(body: string): SignedHs256Payload | null {
  const bodyBytes = base64UrlToBytes(body);
  if (bodyBytes === null) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bodyBytes));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      return null;
    }
    return decoded as SignedHs256Payload;
  } catch {
    return null;
  }
}

/**
 * Verify the signature and decode the payload of an HS256-shaped token, or null if the token is
 * malformed or the signature does not match. Callers validate concrete claims; a verified
 * signature alone does not authorize anything.
 */
export async function decodeSignedHs256Token(
  token: string,
  signingSecret: string,
): Promise<SignedHs256Payload | null> {
  const parts = parseSignedHs256TokenParts(token);
  if (parts === null) {
    return null;
  }
  const signatureValid = await verifySignedHs256Signature(
    parts.signingInput,
    parts.signature,
    signingSecret,
  );
  if (!signatureValid) {
    return null;
  }
  return decodeSignedHs256PayloadBody(parts.body);
}
