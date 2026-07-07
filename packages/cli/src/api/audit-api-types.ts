import type { OrganizationId } from "@insecur/domain";
import type { AuditEventsPage } from "@insecur/audit";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

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
}
