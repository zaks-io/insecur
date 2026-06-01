import { organizationId, userId } from "@insecur/domain";
import { loadInstanceBootstrapRow } from "./bootstrap-store.js";
import type { BootstrapStatus } from "./bootstrap-types.js";

export async function getBootstrapStatus(instanceId: string): Promise<BootstrapStatus> {
  const row = await loadInstanceBootstrapRow(instanceId);
  if (row?.organization_id == null) {
    return { phase: "not_bootstrapped" };
  }

  const orgId = organizationId.brand(row.organization_id);

  if (row.operator_user_id !== null) {
    return {
      phase: "complete",
      instanceId: row.instance_id,
      organizationId: orgId,
      operatorUserId: userId.brand(row.operator_user_id),
    };
  }

  if (row.claim_status === "pending") {
    return {
      phase: "awaiting_operator_claim",
      instanceId: row.instance_id,
      organizationId: orgId,
    };
  }

  return { phase: "not_bootstrapped" };
}
