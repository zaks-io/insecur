import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  machineIdentityId,
  organizationId,
  userId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn(),
  };
});

import {
  recordWebhookDeliveryFailed,
  recordWebhookDeliverySucceeded,
  recordWebhookSubscriptionCreated,
  recordWebhookSubscriptionCreateDenied,
  recordWebhookSubscriptionDeleted,
  recordWebhookSubscriptionUpdated,
} from "../src/record-webhook-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_00000000000000000000000001");

describe("record-webhook-audit", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes success and denied subscription lifecycle audit events", async () => {
    await recordWebhookSubscriptionCreated({
      actorUserId: USER,
      organizationId: ORG,
      subscriptionId: SUBSCRIPTION,
    });
    await recordWebhookSubscriptionCreateDenied({
      actorUserId: USER,
      organizationId: ORG,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
    await recordWebhookDeliverySucceeded({
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      subscriptionId: SUBSCRIPTION,
    });
    await recordWebhookDeliveryFailed({
      actor: {
        type: "machine",
        machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
      },
      organizationId: ORG,
      subscriptionId: SUBSCRIPTION,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
    await recordWebhookSubscriptionUpdated({
      actorUserId: USER,
      organizationId: ORG,
      subscriptionId: SUBSCRIPTION,
    });
    await recordWebhookSubscriptionDeleted({
      actorUserId: USER,
      organizationId: ORG,
      subscriptionId: SUBSCRIPTION,
    });

    expect(writeAuditEvent).toHaveBeenCalledTimes(6);
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreated,
        outcome: "success",
      }),
    );
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookDeliveryFailed,
        outcome: "denied",
      }),
    );
  });
});
