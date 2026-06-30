import { isAuditEventCode, recordActionAudit } from "@insecur/audit";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import type { RecordAbuseDeniedRpcInput } from "@insecur/worker-kit";

/**
 * Records a metadata-only denied audit for public-edge abuse controls (rate limiting).
 * Runs in the Runtime deploy because audit persistence is DB I/O (ADR-0077).
 */
export async function recordAbuseDeniedOperation(
  input: RecordAbuseDeniedRpcInput,
): Promise<{ recorded: true }> {
  if (!isAuditEventCode(input.eventCode)) {
    return { recorded: true };
  }

  const organizationId = await loadInstanceAnchorOrganizationId(input.instanceId);

  await recordActionAudit({
    outcome: "denied",
    eventCode: input.eventCode,
    actor:
      input.actorUserId === undefined || input.actorUserId === null
        ? { type: "user", userId: null }
        : { type: "user", userId: input.actorUserId },
    organizationId,
    request: { requestId: input.requestId },
    reasonCode: input.reasonCode,
  });

  return { recorded: true };
}
