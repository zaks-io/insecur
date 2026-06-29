import { recordAccessDeniedAudit } from "@insecur/audit";
import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import { resolveActiveUserAdmission, withTenantScope } from "@insecur/tenant-store";
import type { RecordAdmissionDeniedRpcInput } from "@insecur/worker-kit";

interface RevokedAdmissionRow {
  user_id: string;
}

async function loadRevokedAdmissionUserId(
  instanceId: string,
  workosUserId: string,
): Promise<string | null> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<RevokedAdmissionRow[]>`
      SELECT user_id
      FROM user_admissions
      WHERE instance_id = ${instanceId}
        AND workos_user_id = ${workosUserId}
        AND status = ${"revoked"}
      LIMIT 1
    `;
  });
  return rows[0]?.user_id ?? null;
}

/**
 * Records a metadata-only denied-attempt audit when persisted admission resolution fails. Relocated
 * from the public edge to the Runtime deploy (ADR-0077): this is DB I/O and runs in the only deploy
 * that binds Hyperdrive. Revoked Users are attributed by insecur user id; unknown WorkOS subjects use
 * a null actor.
 */
export async function recordAdmissionDeniedOperation(
  input: RecordAdmissionDeniedRpcInput,
): Promise<{ recorded: true }> {
  const active = await resolveActiveUserAdmission(input.instanceId, input.workosUserId);
  if (active !== null) {
    return { recorded: true };
  }

  const organizationId = await loadInstanceAnchorOrganizationId(input.instanceId);
  const revokedUserId = await loadRevokedAdmissionUserId(input.instanceId, input.workosUserId);

  await recordAccessDeniedAudit({
    actor:
      revokedUserId === null
        ? { type: "user", userId: null }
        : { type: "user", userId: userId.brand(revokedUserId) },
    organizationId,
    reasonCode: AUTH_ERROR_CODES.required,
    request: { requestId: input.requestId },
  });

  return { recorded: true };
}
