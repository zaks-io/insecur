import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

import { toBufferSource } from "@insecur/crypto";

export interface EventNotificationEnvelope {
  readonly eventCode: string;
  readonly timestamp: string;
  readonly organizationId: string;
  readonly displayNames: Readonly<Record<string, string>>;
  readonly actor: {
    readonly type: "user" | "machine";
    readonly id: string;
  };
  readonly resource?: {
    readonly type: string;
    readonly id: string;
  };
  readonly status: "success" | "denied";
  readonly resultCode?: string;
}

export interface SignedEventNotification {
  readonly envelope: EventNotificationEnvelope;
  readonly signatureTimestamp: string;
  readonly signature: string;
}

const METADATA_ONLY_ENVELOPE_KEYS = new Set([
  "eventCode",
  "timestamp",
  "organizationId",
  "displayNames",
  "actor",
  "resource",
  "status",
  "resultCode",
]);

export function assertMetadataOnlyEnvelope(envelope: EventNotificationEnvelope): void {
  const record = envelope as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!METADATA_ONLY_ENVELOPE_KEYS.has(key)) {
      throw new Error(`envelope contains disallowed key: ${key}`);
    }
  }
  // displayNames keys/values are not scanned for forbidden substrings; callers must supply
  // only non-sensitive human labels (never secret material, ciphertext, or plaintext values).
  for (const value of Object.values(envelope.displayNames)) {
    if (typeof value !== "string") {
      throw new Error("displayNames values must be strings");
    }
  }
}

export function serializeEnvelopeForSigning(
  envelope: EventNotificationEnvelope,
  signatureTimestamp: string,
): string {
  assertMetadataOnlyEnvelope(envelope);
  return JSON.stringify({
    envelope,
    signatureTimestamp,
  });
}

export async function signEventNotificationEnvelope(
  envelope: EventNotificationEnvelope,
  signingSecret: Uint8Array,
  signatureTimestamp: Date,
): Promise<SignedEventNotification> {
  const signatureTimestampIso = signatureTimestamp.toISOString();
  const payload = serializeEnvelopeForSigning(envelope, signatureTimestampIso);
  const key = await crypto.subtle.importKey(
    "raw",
    toBufferSource(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return {
    envelope,
    signatureTimestamp: signatureTimestampIso,
    signature: bytesToBase64Url(new Uint8Array(signatureBytes)),
  };
}

export async function verifyEventNotificationSignature(
  signed: SignedEventNotification,
  signingSecret: Uint8Array,
): Promise<boolean> {
  const payload = serializeEnvelopeForSigning(signed.envelope, signed.signatureTimestamp);
  const signatureBytes = base64UrlToBytes(signed.signature);
  if (signatureBytes === null) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    toBufferSource(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    toBufferSource(signatureBytes),
    new TextEncoder().encode(payload),
  );
}

export function generateWebhookSigningSecretBytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}
