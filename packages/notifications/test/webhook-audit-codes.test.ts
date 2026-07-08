import { describe, expect, it } from "vitest";
import { DENIED_PRODUCTION_AUDIT_EVENT_CODES, PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";

describe("webhook notification audit codes", () => {
  it("registers success and denied delivery audit codes", () => {
    expect(PRODUCTION_AUDIT_EVENT_CODES.webhookDeliverySucceeded).toBe(
      "webhook.delivery_succeeded",
    );
    expect(PRODUCTION_AUDIT_EVENT_CODES.webhookDeliveryFailed).toBe("webhook.delivery_failed");
    expect(
      DENIED_PRODUCTION_AUDIT_EVENT_CODES.has(PRODUCTION_AUDIT_EVENT_CODES.webhookDeliveryFailed),
    ).toBe(true);
  });

  it("registers subscription lifecycle audit codes with denied coverage", () => {
    const deniedCodes = [
      PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreateDenied,
      PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionUpdateDenied,
      PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionDeleteDenied,
    ];
    for (const code of deniedCodes) {
      expect(DENIED_PRODUCTION_AUDIT_EVENT_CODES.has(code)).toBe(true);
    }
    expect(PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreated).toBe(
      "webhook.subscription_created",
    );
  });
});
