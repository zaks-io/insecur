import { ONBOARDING_ERROR_CODES, type UserId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { MembershipManagementError } from "./membership-management-error.js";

interface OperatorRow {
  user_id: string;
}

export async function isInstanceOperator(instanceId: string, userId: UserId): Promise<boolean> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<OperatorRow[]>`
      SELECT user_id
      FROM instance_operators
      WHERE instance_id = ${instanceId}
        AND user_id = ${userId}
      LIMIT 1
    `;
  });
  return rows.length > 0;
}

export async function assertInstanceOperator(instanceId: string, userId: UserId): Promise<void> {
  if (!(await isInstanceOperator(instanceId, userId))) {
    throw new MembershipManagementError(
      ONBOARDING_ERROR_CODES.notInstanceOperator,
      "instance operator authority required",
    );
  }
}
