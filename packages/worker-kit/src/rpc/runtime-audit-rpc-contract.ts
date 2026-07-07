import type { AuditExportManifest } from "@insecur/audit";
import type {
  AuditEventId,
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  UserId,
} from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

/** Metadata-only actor reference for audit read envelopes and principal-chain rendering. */
export interface AuditEventActorRead {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: UserId;
  readonly machineIdentityId?: MachineIdentityId;
}

export interface AuditEventResourceRead {
  readonly type: string;
  readonly id: string;
}

/** Metadata-only audit event row for tenant query reads (no Sensitive Values). */
export interface AuditEventRead {
  readonly auditEventId: AuditEventId;
  readonly organizationId: OrganizationId;
  readonly eventCode: string;
  readonly outcome: "success" | "denied";
  readonly resultCode: string;
  readonly actor: AuditEventActorRead;
  readonly projectId: ProjectId | null;
  readonly environmentId: EnvironmentId | null;
  readonly resource: AuditEventResourceRead | null;
  readonly relatedResource: AuditEventResourceRead | null;
  readonly requestId: string | null;
  readonly operationId: string | null;
  /** Agent-session / harness attribution and other allowlisted metadata live here. */
  readonly details: Readonly<Record<string, string | number | boolean | null>> | null;
  readonly createdAt: string;
}

export interface ListAuditEventsRpcPayload {
  readonly events: readonly AuditEventRead[];
  readonly nextCursor: string | null;
}

export interface ListAuditEventsFiltersRpcInput {
  readonly actorUserId?: UserId;
  readonly actorMachineIdentityId?: MachineIdentityId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly eventCode?: string;
  readonly createdAtFrom?: string;
  readonly createdAtTo?: string;
}

export interface ListAuditEventsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly filters?: ListAuditEventsFiltersRpcInput;
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface ExportTenantAuditRpcPayload {
  readonly jsonl: string;
  readonly manifest: AuditExportManifest;
}

export interface ExportTenantAuditRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly from: string;
  readonly to: string;
}
