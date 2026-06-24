import { recordAccessDeniedAudit } from "@insecur/audit";
import { AUTH_ERROR_CODES, userId, type RequestId } from "@insecur/domain";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import { resolveActiveUserAdmission, withTenantScope } from "@insecur/tenant-store";

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
 * Records a metadata-only denied-attempt audit when admission fails for a known revoked User.
 * Unknown or never-admitted WorkOS subjects have no insecur User id and are not audited here.
 */
export async function recordAdmissionDeniedAuditIfKnown(input: {
  instanceId: string;
  workosUserId: string;
  requestId: RequestId;
}): Promise<void> {
  const active = await resolveActiveUserAdmission(input.instanceId, input.workosUserId);
  if (active !== null) {
    return;
  }

  const revokedUserId = await loadRevokedAdmissionUserId(input.instanceId, input.workosUserId);
  if (revokedUserId === null) {
    return;
  }

  const organizationId = await loadInstanceAnchorOrganizationId(input.instanceId);
  await recordAccessDeniedAudit({
    actor: { type: "user", userId: userId.brand(revokedUserId) },
    organizationId,
    reasonCode: AUTH_ERROR_CODES.required,
    request: { requestId: input.requestId },
  });
}
