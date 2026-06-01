import { userId } from "@insecur/domain";
import { CLI_SESSION_TTL_SECONDS } from "./constants.js";
import type { UserActor } from "./user-actor.js";

const EPHEMERAL_TYP = "insecur_cli_session_v1";

interface EphemeralSessionPayload {
  readonly sub: string;
  readonly wid: string;
  readonly sid: string;
  readonly exp: number;
  readonly iat: number;
  readonly typ: string;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

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
  return encodeBase64Url(new Uint8Array(signature));
}

async function verifySignature(
  payloadJson: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await importSigningKey(secret);
  const data = new TextEncoder().encode(payloadJson);
  const signatureBytes = decodeBase64Url(signature);
  return crypto.subtle.verify("HMAC", key, signatureBytes, data);
}

export interface MintEphemeralSessionInput {
  readonly actor: UserActor;
  readonly signingSecret: string;
  readonly ttlSeconds?: number;
}

export interface MintEphemeralSessionResult {
  readonly credential: string;
  readonly expiresAt: string;
}

export async function mintEphemeralSessionCredential(
  input: MintEphemeralSessionInput,
): Promise<MintEphemeralSessionResult> {
  const ttlSeconds = input.ttlSeconds ?? CLI_SESSION_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = issuedAt + ttlSeconds;
  const payload: EphemeralSessionPayload = {
    sub: input.actor.userId,
    wid: input.actor.workosUserId,
    sid: input.actor.sessionId,
    exp: expiresAtEpoch,
    iat: issuedAt,
    typ: EPHEMERAL_TYP,
  };
  const header = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = await signPayload(signingInput, input.signingSecret);
  return {
    credential: `${signingInput}.${signature}`,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
}

export type VerifyEphemeralSessionResult =
  | { ok: true; actor: UserActor }
  | { ok: false; reason: "expired" | "invalid" };

function parseCredentialParts(
  credential: string,
): { signingInput: string; body: string; signature: string } | null {
  const parts = credential.split(".");
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

function parsePayload(body: string): EphemeralSessionPayload | null {
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(body));
    return JSON.parse(decoded) as EphemeralSessionPayload;
  } catch {
    return null;
  }
}

function actorFromPayload(payload: EphemeralSessionPayload): VerifyEphemeralSessionResult {
  if (payload.typ !== EPHEMERAL_TYP) {
    return { ok: false, reason: "invalid" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { ok: false, reason: "expired" };
  }
  const parsedUserId = userId.parse(payload.sub);
  if (!parsedUserId.ok) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    actor: {
      type: "user",
      userId: parsedUserId.value,
      workosUserId: payload.wid,
      sessionId: payload.sid,
    },
  };
}

export async function verifyEphemeralSessionCredential(
  credential: string,
  signingSecret: string,
): Promise<VerifyEphemeralSessionResult> {
  const parts = parseCredentialParts(credential);
  if (parts === null) {
    return { ok: false, reason: "invalid" };
  }
  const signatureValid = await verifySignature(parts.signingInput, parts.signature, signingSecret);
  if (!signatureValid) {
    return { ok: false, reason: "invalid" };
  }
  const payload = parsePayload(parts.body);
  if (payload === null) {
    return { ok: false, reason: "invalid" };
  }
  return actorFromPayload(payload);
}
