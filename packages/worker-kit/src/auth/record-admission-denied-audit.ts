import type { AuthFailure } from "@insecur/auth";
import { recordAccessDeniedAudit } from "@insecur/audit";
import { AUTH_ERROR_CODES, userId, type RequestId } from "@insecur/domain";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import { resolveActiveUserAdmission, withTenantScope } from "@insecur/tenant-store";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { resolveInstanceId } from "./admitted-user-resolver.js";

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
 * Records a metadata-only denied-attempt audit when persisted admission resolution fails.
 * Revoked Users are attributed by insecur user id; unknown WorkOS subjects use a null actor.
 */
export async function recordAdmissionDeniedAudit(input: {
  instanceId: string;
  workosUserId: string;
  requestId: RequestId;
}): Promise<void> {
  const active = await resolveActiveUserAdmission(input.instanceId, input.workosUserId);
  if (active !== null) {
    return;
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
}

/**
 * Best-effort denied-admission audit for auth middleware and CLI exchange paths.
 * Failures are swallowed so the original {@link AuthFailureError} contract is preserved.
 */
export async function recordAdmissionDeniedAuditForAuthFailure(
  env: AuthWorkerEnv,
  failure: AuthFailure,
  requestId: RequestId,
): Promise<void> {
  if (failure.reason !== "not_admitted" || failure.admissionDenial === undefined) {
    return;
  }
  try {
    await recordAdmissionDeniedAudit({
      instanceId: resolveInstanceId(env),
      workosUserId: failure.admissionDenial.workosUserId,
      requestId,
    });
  } catch {
    // Best-effort: preserve the original AuthFailureError response contract.
  }
}
