import type { OperationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { SyncTargetLeaseRow } from "./sync-target-lease-row.js";
import type { FencingToken, SyncTargetKey } from "./sync-target-types.js";
import { assertFencingToken } from "./sync-target-types.js";

export function parseFencingToken(row: Pick<SyncTargetLeaseRow, "fencing_token">): FencingToken {
  const fencingToken = Number(row.fencing_token);
  assertFencingToken(fencingToken);
  return fencingToken;
}

function targetBusyError(): OperationStoreError {
  return new OperationStoreError(
    OPERATION_ERROR_CODES.targetBusy,
    "sync target lease is held by another operation",
    true,
  );
}

/**
 * Atomically claims or resumes a sync target lease without surfacing raw Postgres conflicts.
 */
export async function upsertClaimSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    target: SyncTargetKey;
    operationId: OperationId;
    ttlSeconds: number;
  },
): Promise<FencingToken> {
  const rows = await sql<Pick<SyncTargetLeaseRow, "fencing_token">[]>`
    INSERT INTO sync_target_leases AS existing (
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
    ON CONFLICT (org_id, project_id, provider_kind, target_identity) DO UPDATE
    SET
      held_by_operation_id = EXCLUDED.held_by_operation_id,
      fencing_token = CASE
        WHEN existing.expires_at > now()
          AND existing.held_by_operation_id = EXCLUDED.held_by_operation_id
        THEN existing.fencing_token
        ELSE existing.fencing_token + 1
      END,
      expires_at = now() + (${input.ttlSeconds} * interval '1 second'),
      updated_at = now()
    WHERE
      existing.expires_at <= now()
      OR existing.held_by_operation_id = EXCLUDED.held_by_operation_id
    RETURNING fencing_token
  `;
  const row = rows[0];
  if (row === undefined) {
    throw targetBusyError();
  }
  return parseFencingToken(row);
}

export async function selectActiveSyncTargetLeaseForOperation(
  sql: TenantScopedSql,
  input: {
    organizationId: SyncTargetKey["organizationId"];
    operationId: OperationId;
  },
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
    WHERE org_id = ${input.organizationId}
      AND held_by_operation_id = ${input.operationId}
      AND expires_at > now()
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
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
