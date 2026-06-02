import type { OperationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { SyncTargetLeaseRow } from "./sync-target-lease-row.js";
import type { FencingToken, SyncTargetKey } from "./sync-target-types.js";
import { assertFencingToken } from "./sync-target-types.js";

export function parseFencingToken(row: Pick<SyncTargetLeaseRow, "fencing_token">): FencingToken {
  const fencingToken = Number(row.fencing_token);
  assertFencingToken(fencingToken);
  return fencingToken;
}

export async function insertSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    target: SyncTargetKey;
    operationId: OperationId;
    ttlSeconds: number;
  },
): Promise<FencingToken> {
  const rows = await sql<SyncTargetLeaseRow[]>`
    INSERT INTO sync_target_leases (
      org_id,
      project_id,
      provider_kind,
      target_identity,
      held_by_operation_id,
      fencing_token,
      expires_at
    )
    VALUES (
      ${input.target.organizationId},
      ${input.target.projectId},
      ${input.target.providerKind},
      ${input.target.targetIdentity},
      ${input.operationId},
      ${1},
      now() + (${input.ttlSeconds} * interval '1 second')
    )
    RETURNING fencing_token
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("insert sync_target_lease returned no row");
  }
  return parseFencingToken(row);
}

export async function selectSyncTargetLeaseForUpdate(
  sql: TenantScopedSql,
  target: SyncTargetKey,
): Promise<SyncTargetLeaseRow | null> {
  const rows = await sql<SyncTargetLeaseRow[]>`
    SELECT
      org_id,
      project_id,
      provider_kind,
      target_identity,
      held_by_operation_id,
      fencing_token,
      expires_at
    FROM sync_target_leases
    WHERE org_id = ${target.organizationId}
      AND project_id = ${target.projectId}
      AND provider_kind = ${target.providerKind}
      AND target_identity = ${target.targetIdentity}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function takeoverSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    target: SyncTargetKey;
    operationId: OperationId;
    ttlSeconds: number;
  },
): Promise<FencingToken | null> {
  const rows = await sql<SyncTargetLeaseRow[]>`
    UPDATE sync_target_leases
    SET
      held_by_operation_id = ${input.operationId},
      fencing_token = fencing_token + 1,
      expires_at = now() + (${input.ttlSeconds} * interval '1 second'),
      updated_at = now()
    WHERE org_id = ${input.target.organizationId}
      AND project_id = ${input.target.projectId}
      AND provider_kind = ${input.target.providerKind}
      AND target_identity = ${input.target.targetIdentity}
      AND (
        expires_at <= now()
        OR held_by_operation_id = ${input.operationId}
      )
    RETURNING fencing_token
  `;
  const row = rows[0];
  return row === undefined ? null : parseFencingToken(row);
}

export async function extendSyncTargetLeaseExpiry(
  sql: TenantScopedSql,
  input: {
    target: SyncTargetKey;
    operationId: OperationId;
    fencingToken: FencingToken;
    ttlSeconds: number;
  },
): Promise<FencingToken | null> {
  const rows = await sql<SyncTargetLeaseRow[]>`
    UPDATE sync_target_leases
    SET
      expires_at = now() + (${input.ttlSeconds} * interval '1 second'),
      updated_at = now()
    WHERE org_id = ${input.target.organizationId}
      AND project_id = ${input.target.projectId}
      AND provider_kind = ${input.target.providerKind}
      AND target_identity = ${input.target.targetIdentity}
      AND held_by_operation_id = ${input.operationId}
      AND expires_at > now()
      AND fencing_token = ${input.fencingToken}
    RETURNING fencing_token
  `;
  const row = rows[0];
  return row === undefined ? null : parseFencingToken(row);
}

export async function deleteSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    target: SyncTargetKey;
    operationId: OperationId;
    fencingToken: FencingToken;
  },
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM sync_target_leases
    WHERE org_id = ${input.target.organizationId}
      AND project_id = ${input.target.projectId}
      AND provider_kind = ${input.target.providerKind}
      AND target_identity = ${input.target.targetIdentity}
      AND held_by_operation_id = ${input.operationId}
      AND fencing_token = ${input.fencingToken}
    RETURNING held_by_operation_id AS id
  `;
  return rows[0] !== undefined;
}

export async function selectSyncTargetLease(
  sql: TenantScopedSql,
  target: SyncTargetKey,
): Promise<SyncTargetLeaseRow | null> {
  const rows = await sql<SyncTargetLeaseRow[]>`
    SELECT
      org_id,
      project_id,
      provider_kind,
      target_identity,
      held_by_operation_id,
      fencing_token,
      expires_at
    FROM sync_target_leases
    WHERE org_id = ${target.organizationId}
      AND project_id = ${target.projectId}
      AND provider_kind = ${target.providerKind}
      AND target_identity = ${target.targetIdentity}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
