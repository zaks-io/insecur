import type { OperationId, OrganizationId, ProjectId } from "@insecur/domain";
import { toIsoTimestamp } from "@insecur/tenant-store";
import type { FencingToken, SyncProviderKind, SyncTargetKey } from "./sync-target-types.js";

export interface SyncTargetLeaseRow {
  readonly org_id: OrganizationId;
  readonly project_id: ProjectId;
  readonly provider_kind: SyncProviderKind;
  readonly target_identity: string;
  readonly held_by_operation_id: OperationId;
  readonly fencing_token: string;
  readonly expires_at: Date | string;
}

export interface SyncTargetLeaseSnapshot {
  readonly target: SyncTargetKey;
  readonly heldByOperationId: OperationId;
  readonly fencingToken: FencingToken;
  readonly expiresAt: string;
}

export function toSyncTargetLeaseSnapshot(row: SyncTargetLeaseRow): SyncTargetLeaseSnapshot {
  const fencingToken = Number(row.fencing_token);
  return {
    target: {
      organizationId: row.org_id,
      projectId: row.project_id,
      providerKind: row.provider_kind,
      targetIdentity: row.target_identity,
    },
    heldByOperationId: row.held_by_operation_id,
    fencingToken,
    expiresAt: toIsoTimestamp(row.expires_at),
  };
}
