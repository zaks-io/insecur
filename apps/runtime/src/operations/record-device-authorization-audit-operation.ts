import { FIRST_VALUE_AUDIT_EVENT_CODES, recordActionAudit } from "@insecur/audit";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import type { RecordDeviceAuthorizationAuditRpcInput } from "@insecur/worker-kit";

/** Records the terminal OAuth device-authorization outcome in the instance anchor tenant. */
export async function recordDeviceAuthorizationAuditOperation(
  input: RecordDeviceAuthorizationAuditRpcInput,
): Promise<{ recorded: true }> {
  const organizationId = await loadInstanceAnchorOrganizationId(input.instanceId);
  const approved = input.outcome === "approved";

  await recordActionAudit({
    outcome: approved ? "success" : "denied",
    eventCode: approved
      ? FIRST_VALUE_AUDIT_EVENT_CODES.authCliDeviceAuthorizationApproved
      : FIRST_VALUE_AUDIT_EVENT_CODES.authCliDeviceTokenDenied,
    actor: { type: "user", userId: input.actorUserId ?? null },
    organizationId,
    request: { requestId: input.requestId },
    ...(approved
      ? {}
      : { reasonCode: input.reasonCode ?? AUTH_ERROR_CODES.deviceAuthorizationDenied }),
    details: {
      agentSession: input.agentSession,
      ...(input.requesterHost === undefined ? {} : { requesterHost: input.requesterHost }),
      ...(input.requesterIp === undefined ? {} : { requesterIp: input.requesterIp }),
    },
  });

  return { recorded: true };
}
