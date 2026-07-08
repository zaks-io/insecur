import {
  listProjectInjectionGrantRows,
  toIsoTimestamp,
  withTenantScope,
  type ProjectInjectionGrantRow,
} from "@insecur/tenant-store";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type {
  ListProjectInjectionGrantsRpcInput,
  ListProjectInjectionGrantsRpcPayload,
  ProjectInjectionGrantRead,
} from "@insecur/worker-kit";

import { authorizeProjectEnvironmentReadScopes } from "./authorize-environment-secret-read.js";
import { toPrincipalChainActorRead } from "./principal-chain-actor-read.js";

export interface ListProjectInjectionGrantsOperationInput {
  readonly input: ListProjectInjectionGrantsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function toInjectionGrantRead(row: ProjectInjectionGrantRow): ProjectInjectionGrantRead {
  const issuedByActor = row.issuedByActor
    ? toPrincipalChainActorRead(row.issuedByActor)
    : undefined;
  const consumedByActor = row.consumedByActor
    ? toPrincipalChainActorRead(row.consumedByActor)
    : undefined;

  return {
    grantId: row.grantId,
    environmentId: row.environmentId,
    variableKeys: row.variableKeys,
    status: row.status,
    createdAt: toIsoTimestamp(row.createdAt),
    expiresAt: toIsoTimestamp(row.expiresAt),
    ...(row.consumedAt !== null ? { consumedAt: toIsoTimestamp(row.consumedAt) } : {}),
    ...(row.revokedAt !== null ? { revokedAt: toIsoTimestamp(row.revokedAt) } : {}),
    ...(row.revokedReason !== null ? { revokedReason: row.revokedReason } : {}),
    ...(issuedByActor !== undefined ? { issuedByActor } : {}),
    ...(consumedByActor !== undefined ? { consumedByActor } : {}),
  };
}

/**
 * Authorize-then-read for project injection grant history (INS-382). Requires `project:read` and
 * `environment:read` at the project coordinate. Grant rows are metadata-only and never include
 * token material; attribution comes from audit principal-chain metadata.
 */
export async function listProjectInjectionGrantsOperation({
  input,
  auditActor,
  accessActor,
}: ListProjectInjectionGrantsOperationInput): Promise<ListProjectInjectionGrantsRpcPayload> {
  await authorizeProjectEnvironmentReadScopes({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  });

  const rows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      listProjectInjectionGrantRows(db, {
        organizationId: input.organizationId,
        projectId: input.projectId,
      }),
  );

  return {
    grants: rows.map((row) => toInjectionGrantRead(row)),
  };
}
