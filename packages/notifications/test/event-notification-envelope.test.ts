import { describe, expect, it } from "vitest";
import {
  assertMetadataOnlyEnvelope,
  generateWebhookSigningSecretBytes,
  signEventNotificationEnvelope,
  verifyEventNotificationSignature,
  type EventNotificationEnvelope,
} from "../src/event-notification-envelope.js";
import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

const SAMPLE_ENVELOPE: EventNotificationEnvelope = {
  eventCode: "secret.non_protected_write",
  timestamp: "2026-07-07T12:00:00.000Z",
  organizationId: "org_00000000000000000000000001",
  displayNames: {
    organization: "Acme",
    secret: "API Key",
  },
  actor: { type: "user", id: "usr_00000000000000000000000001" },
  resource: { type: "secret", id: "sec_00000000000000000000000001" },
  status: "success",
};

describe("event notification envelope", () => {
  it("signs and verifies with the per-subscription secret", async () => {
    const secret = generateWebhookSigningSecretBytes();
    const signed = await signEventNotificationEnvelope(
      SAMPLE_ENVELOPE,
      secret,
      new Date("2026-07-07T12:00:01.000Z"),
    );
    await expect(verifyEventNotificationSignature(signed, secret)).resolves.toBe(true);
    const wrongSecret = generateWebhookSigningSecretBytes();
    await expect(verifyEventNotificationSignature(signed, wrongSecret)).resolves.toBe(false);
  });

  it("rejects envelopes with disallowed keys (metadata-only)", () => {
    expect(() => assertMetadataOnlyEnvelope(SAMPLE_ENVELOPE)).not.toThrow();
    expect(() =>
      assertMetadataOnlyEnvelope({
        ...SAMPLE_ENVELOPE,
        secretValue: "must-not-appear",
      } as EventNotificationEnvelope),
    ).toThrow(/disallowed key/);
  });

  it("verifies signatures only until the retired secret is used", async () => {
    const activeSecret = generateWebhookSigningSecretBytes();
    const retiredSecret = generateWebhookSigningSecretBytes();
    const signedWithRetired = await signEventNotificationEnvelope(
      SAMPLE_ENVELOPE,
      retiredSecret,
      new Date("2026-07-07T11:00:00.000Z"),
    );
    await expect(verifyEventNotificationSignature(signedWithRetired, retiredSecret)).resolves.toBe(
      true,
    );
    await expect(verifyEventNotificationSignature(signedWithRetired, activeSecret)).resolves.toBe(
      false,
    );
    const signedWithActive = await signEventNotificationEnvelope(
      SAMPLE_ENVELOPE,
      activeSecret,
      new Date("2026-07-07T12:00:00.000Z"),
    );
    await expect(verifyEventNotificationSignature(signedWithActive, activeSecret)).resolves.toBe(
      true,
    );
  });

  it("never places signing secret material in the signed payload", async () => {
    const secret = generateWebhookSigningSecretBytes();
    const secretB64 = bytesToBase64Url(secret);
    const signed = await signEventNotificationEnvelope(
      SAMPLE_ENVELOPE,
      secret,
      new Date("2026-07-07T12:00:00.000Z"),
    );
    const serialized = JSON.stringify(signed);
    expect(serialized.includes(secretB64)).toBe(false);
    expect(serialized.includes("plaintext")).toBe(false);
    const signatureBytes = base64UrlToBytes(signed.signature);
    expect(signatureBytes).not.toBeNull();
    if (!signatureBytes) {
      throw new Error("expected signature bytes");
    }
    expect(signatureBytes.length).toBeGreaterThan(0);
  });
});
