import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  NOTIFICATION_ERROR_CODES,
  organizationId,
  parseDisplayName,
  requestId,
  userId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { buildEnvelopeFromAuditEvent } from "../src/emit-event-notifications.js";
import { parseCreateWebhookSubscriptionDisplayName } from "../src/create-webhook-subscription.js";
import { toWebhookAuditReasonCode } from "../src/record-webhook-audit.js";
import {
  isWebhookEventCode,
  listWebhookEventCodes,
  WEBHOOK_EVENT_CODES,
} from "../src/webhook-event-codes.js";
import {
  buildWebhookAuditScope,
  buildWebhookSubscriptionAuditScope,
  assertV1WebhookChannels,
  toReadPayload,
  toPayload,
  validateEventCodes,
} from "../src/webhook-subscription-shared.js";
import { webhookSigningSecretCredentialIdentity } from "../src/webhook-signing-secret-credential-identity.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

function parseName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

const SAMPLE_ROW = {
  subscriptionId: SUBSCRIPTION,
  organizationId: ORG,
  displayName: parseName("Alerts"),
  status: "active" as const,
  eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
  deliveryEmail: "alerts@example.com",
  enableEmailChannel: true,
  enableInAppChannel: true,
  createdAt: new Date("2026-07-07T12:00:00.000Z"),
  updatedAt: new Date("2026-07-07T12:00:00.000Z"),
};

describe("webhook event codes", () => {
  it("lists stable selectable event codes", () => {
    const codes = listWebhookEventCodes();
    expect(codes.length).toBeGreaterThan(0);
    expect(codes).toContain(WEBHOOK_EVENT_CODES.secretNonProtectedWrite);
    expect(isWebhookEventCode(WEBHOOK_EVENT_CODES.secretNonProtectedWrite)).toBe(true);
    expect(isWebhookEventCode("not.a.real.event")).toBe(false);
  });
});

describe("validateEventCodes", () => {
  it("rejects empty and unknown event codes", () => {
    expect(() => validateEventCodes([])).toThrow(/webhook event type/);
    expect(() => validateEventCodes(["unknown.event"])).toThrow(/Invalid webhook event type/);
    expect(() => validateEventCodes([WEBHOOK_EVENT_CODES.secretNonProtectedWrite])).not.toThrow();
  });
});

describe("assertV1WebhookChannels", () => {
  it("rejects email affordances and subscriptions with no enabled channel", () => {
    expect(() =>
      assertV1WebhookChannels({
        enableEmailChannel: true,
        deliveryEmail: "alerts@example.com",
      }),
    ).toThrow(/Email channel is not available/);
    expect(() =>
      assertV1WebhookChannels({
        enableEmailChannel: false,
        enableInAppChannel: false,
      }),
    ).toThrow(/At least one delivery channel must be enabled/);
    expect(() =>
      assertV1WebhookChannels({
        enableEmailChannel: false,
        enableInAppChannel: true,
      }),
    ).not.toThrow();
  });
});

describe("webhook audit scope builders", () => {
  it("threads optional request ids into audit scope", () => {
    expect(buildWebhookAuditScope({ actorUserId: USER, organizationId: ORG })).toEqual({
      actorUserId: USER,
      organizationId: ORG,
    });
    expect(
      buildWebhookAuditScope({ actorUserId: USER, organizationId: ORG, requestId: REQ }),
    ).toEqual({
      actorUserId: USER,
      organizationId: ORG,
      request: { requestId: REQ },
    });
    expect(
      buildWebhookSubscriptionAuditScope({
        actorUserId: USER,
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        requestId: REQ,
      }),
    ).toEqual({
      actorUserId: USER,
      organizationId: ORG,
      subscriptionId: SUBSCRIPTION,
      request: { requestId: REQ },
    });
  });
});

describe("subscription payload mappers", () => {
  it("maps store rows to read and create payloads", () => {
    expect(toReadPayload(SAMPLE_ROW)).toEqual({
      subscriptionId: SUBSCRIPTION,
      organizationId: ORG,
      displayName: SAMPLE_ROW.displayName,
      status: "active",
      eventCodes: SAMPLE_ROW.eventCodes,
      deliveryEmail: "alerts@example.com",
      enableEmailChannel: true,
      enableInAppChannel: true,
      createdAt: "2026-07-07T12:00:00.000Z",
      updatedAt: "2026-07-07T12:00:00.000Z",
    });
    expect(toPayload(SAMPLE_ROW, "secret-b64")).toMatchObject({
      subscriptionId: SUBSCRIPTION,
      signingSecret: "secret-b64",
    });
    expect(() => toPayload(null, "secret-b64")).toThrow("subscription missing");
  });
});

describe("toWebhookAuditReasonCode", () => {
  it("maps coded errors and falls back to insufficient scope", () => {
    expect(
      toWebhookAuditReasonCode(
        Object.assign(new Error("denied"), { code: NOTIFICATION_ERROR_CODES.deliveryFailed }),
      ),
    ).toBe(NOTIFICATION_ERROR_CODES.deliveryFailed);
    expect(toWebhookAuditReasonCode(new Error("unknown"))).toBe(AUTH_ERROR_CODES.insufficientScope);
  });
});

describe("parseCreateWebhookSubscriptionDisplayName", () => {
  it("parses valid display names and rejects invalid values", () => {
    expect(parseCreateWebhookSubscriptionDisplayName("Security alerts")).toBe(
      parseName("Security alerts"),
    );
    expect(() => parseCreateWebhookSubscriptionDisplayName("")).toThrow();
  });
});

describe("buildEnvelopeFromAuditEvent", () => {
  it("builds metadata-only envelopes for user, machine, and denied events", () => {
    const displayNames = { organization: "Acme", secret: "API Key" };
    const userEnvelope = buildEnvelopeFromAuditEvent(
      {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        resource: { type: "secret", id: "sec_00000000000000000000000001" },
      },
      displayNames,
    );
    expect(userEnvelope).toMatchObject({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      organizationId: ORG,
      displayNames,
      actor: { type: "user", id: USER },
      status: "success",
      resource: { type: "secret", id: "sec_00000000000000000000000001" },
    });

    const machineEnvelope = buildEnvelopeFromAuditEvent(
      {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
        outcome: "success",
        actor: { type: "machine", machineIdentityId: "mid_00000000000000000000000001" },
        organizationId: ORG,
      },
      displayNames,
    );
    expect(machineEnvelope.actor).toEqual({
      type: "machine",
      id: "mid_00000000000000000000000001",
    });

    const deniedEnvelope = buildEnvelopeFromAuditEvent(
      {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "denied",
        actor: { type: "ci_exchange" },
        organizationId: ORG,
        denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope },
      },
      displayNames,
    );
    expect(deniedEnvelope).toMatchObject({
      status: "denied",
      resultCode: AUTH_ERROR_CODES.insufficientScope,
      actor: { type: "machine", id: "ci_exchange" },
    });
  });
});

describe("webhookSigningSecretCredentialIdentity", () => {
  it("binds signing secrets to provider-credential AAD", () => {
    expect(
      webhookSigningSecretCredentialIdentity({
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        signingSecretId: "whsec_00000000000000000000000001",
      }),
    ).toEqual({
      provider: "webhook-signing-secret",
      organizationId: ORG,
      appConnectionId: SUBSCRIPTION,
      credentialId: "whsec_00000000000000000000000001",
    });
  });
});
