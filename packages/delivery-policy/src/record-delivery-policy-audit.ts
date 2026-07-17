import {
  PRODUCTION_AUDIT_EVENT_CODES,
  recordActionAudit,
  type AuditActorRef,
  type AuditEventResult,
  type AuditResourceRef,
  type ProductionAuditEventCode,
} from "@insecur/audit";
import type { EnvironmentId, KnownErrorCode, OrganizationId, ProjectId } from "@insecur/domain";

/** One audited Delivery Risk Policy action class (ADR-0043, INS-88). */
export type DeliveryPolicyAuditAction =
  "preset_selection" | "preview_opt_in_enable" | "preview_opt_in_revoke" | "automation_resolution";

const AUDIT_EVENT_CODES_BY_ACTION: Readonly<
  Record<
    DeliveryPolicyAuditAction,
    { readonly success: ProductionAuditEventCode; readonly denied: ProductionAuditEventCode }
  >
> = {
  preset_selection: {
    success: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyPresetSelected,
    denied: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyPresetSelectionDenied,
  },
  preview_opt_in_enable: {
    success: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyPreviewOptInEnabled,
    denied: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyPreviewOptInEnableDenied,
  },
  preview_opt_in_revoke: {
    success: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyPreviewOptInRevoked,
    denied: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyPreviewOptInRevokeDenied,
  },
  automation_resolution: {
    success: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyAutomationAuthorized,
    denied: PRODUCTION_AUDIT_EVENT_CODES.deliveryPolicyAutomationDenied,
  },
};

/** Metadata-safe detail values: stable dotted codes, numbers, and booleans only (ADR-0068). */
export type DeliveryPolicyAuditDetails = Readonly<Record<string, string | number | boolean>>;

export interface RecordDeliveryPolicyAuditInput {
  readonly action: DeliveryPolicyAuditAction;
  readonly outcome: "success" | "denied";
  readonly actor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly resource?: AuditResourceRef;
  readonly details?: DeliveryPolicyAuditDetails;
  readonly reasonCode?: KnownErrorCode;
}

/**
 * Records the metadata-only outcome of a Delivery Risk Policy action (ADR-0043, INS-88):
 * preset selection, preview automation opt-in changes, and automation resolution verdicts.
 * Never carries Sensitive Values — only opaque ids, dotted codes, versions, and outcomes.
 */
export async function recordDeliveryPolicyAudit(
  input: RecordDeliveryPolicyAuditInput,
): Promise<AuditEventResult | undefined> {
  const codes = AUDIT_EVENT_CODES_BY_ACTION[input.action];

  return recordActionAudit({
    eventCode: input.outcome === "success" ? codes.success : codes.denied,
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
    ...(input.resource === undefined ? {} : { resource: input.resource }),
    ...(input.details === undefined ? {} : { details: input.details }),
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  });
}
