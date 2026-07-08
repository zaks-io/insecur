import type { OrganizationId } from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import type { AuditEventsPage, AuditExportBundle } from "@insecur/audit";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface ListAuditEventsFiltersInput {
  readonly actorUserId?: string;
  readonly actorMachineIdentityId?: string;
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly eventCode?: string;
  readonly createdAtFrom?: string;
  readonly createdAtTo?: string;
}

export type ListAuditEventsData = AuditEventsPage;
export type ExportTenantAuditData = AuditExportBundle;

export interface AuditApiClient {
  listAuditEvents(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly pageSize?: number;
    readonly cursor?: string;
    readonly filters?: ListAuditEventsFiltersInput;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ListAuditEventsData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  exportTenantAudit(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly from: string;
    readonly to: string;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ExportTenantAuditData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
