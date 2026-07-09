import { organizationId, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordDeviceAuthorizationAuditOperation } from "./record-device-authorization-audit-operation.js";

vi.mock("@insecur/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@insecur/audit")>()),
  recordActionAudit: vi.fn(),
}));
vi.mock("@insecur/onboarding", () => ({ loadInstanceAnchorOrganizationId: vi.fn() }));

import { recordActionAudit } from "@insecur/audit";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";

const actorUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const anchorOrganizationId = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const reqId = requestId.brand("req_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

describe("recordDeviceAuthorizationAuditOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadInstanceAnchorOrganizationId).mockResolvedValue(anchorOrganizationId);
  });

  it("records approved device authorization with bound requester metadata", async () => {
    await recordDeviceAuthorizationAuditOperation({
      instanceId: "inst_test",
      requestId: reqId,
      outcome: "approved",
      actorUserId,
      agentSession: true,
      requesterHost: "remote-agent-host",
      requesterIp: "203.0.113.9",
    });

    expect(recordActionAudit).toHaveBeenCalledWith({
      outcome: "success",
      eventCode: "auth.cli_device_authorization_approved",
      actor: { type: "user", userId: actorUserId },
      organizationId: anchorOrganizationId,
      request: { requestId: reqId },
      details: {
        agentSession: true,
        requesterHost: "remote-agent-host",
        requesterIp: "203.0.113.9",
      },
    });
  });

  it("records provider denial with its stable auth reason", async () => {
    await recordDeviceAuthorizationAuditOperation({
      instanceId: "inst_test",
      requestId: reqId,
      outcome: "denied",
      reasonCode: "auth.device_authorization_expired",
      agentSession: false,
    });

    expect(recordActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        eventCode: "auth.cli_device_token_denied",
        actor: { type: "user", userId: null },
        reasonCode: "auth.device_authorization_expired",
      }),
    );
  });
});
