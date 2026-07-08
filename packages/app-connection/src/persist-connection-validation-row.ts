import type { AppConnectionId, OrganizationId } from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

export async function updateConnectionValidationSuccessRow(input: {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly checkedAt: Date;
  readonly appConnectionStore: TenantAppConnectionStore;
}): Promise<AppConnectionRow> {
  return input.appConnectionStore.updateConnectionValidation({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    lastValidationCheckedAt: input.checkedAt,
    lastValidationOutcome: "success",
    lastValidationReasonCode: null,
  });
}
