import {
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  type VariableKey,
} from "@insecur/domain";
import { and, desc, eq } from "drizzle-orm";

import { injectionGrants } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { loadLatestPrincipalChainActorsByResourceId } from "../secrets/secret-write-audit-attribution-queries.js";
import type {
  InjectionGrantLifecycleStatus,
  ListProjectInjectionGrantsInput,
  ProjectInjectionGrantRow,
} from "./project-injection-grant-metadata-types.js";
import type { PrincipalChainActorRow } from "../secrets/principal-chain-actor-types.js";

const GRANT_ISSUED_EVENT_CODE = "runtime_injection.grant_issued";
const GRANT_CONSUMED_EVENT_CODE = "runtime_injection.grant_consumed";

interface RawGrantRow {
  readonly grantId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly variableKeys: readonly string[];
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
  readonly createdAt: Date;
}

function parseRevokedReason(
  value: string | null,
): "tenant_suspension" | "compromise_version_invalidation" | null {
  if (value === "tenant_suspension" || value === "compromise_version_invalidation") {
    return value;
  }
  return null;
}

function deriveGrantStatus(row: {
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}): InjectionGrantLifecycleStatus {
  if (row.consumedAt !== null) {
    return "consumed";
  }
  if (row.revokedAt !== null) {
    return "revoked";
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return "active";
}

async function loadRawProjectGrantRows(
  db: TenantScopedDb,
  input: ListProjectInjectionGrantsInput,
): Promise<readonly RawGrantRow[]> {
  return db
    .select({
      grantId: injectionGrants.id,
      organizationId: injectionGrants.orgId,
      projectId: injectionGrants.projectId,
      environmentId: injectionGrants.environmentId,
      variableKeys: injectionGrants.variableKeys,
      expiresAt: injectionGrants.expiresAt,
      consumedAt: injectionGrants.consumedAt,
      revokedAt: injectionGrants.revokedAt,
      revokedReason: injectionGrants.revokedReason,
      createdAt: injectionGrants.createdAt,
    })
    .from(injectionGrants)
    .where(
      and(
        eq(injectionGrants.orgId, input.organizationId),
        eq(injectionGrants.projectId, input.projectId),
      ),
    )
    .orderBy(desc(injectionGrants.createdAt));
}

async function loadGrantAttributionMaps(
  db: TenantScopedDb,
  input: ListProjectInjectionGrantsInput,
  grantIds: readonly string[],
): Promise<{
  readonly issuedByGrantId: Map<string, PrincipalChainActorRow>;
  readonly consumedByGrantId: Map<string, PrincipalChainActorRow>;
}> {
  const attributionInput = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    resourceType: "injection_grant",
    resourceIds: grantIds,
  };
  const [issuedByGrantId, consumedByGrantId] = await Promise.all([
    loadLatestPrincipalChainActorsByResourceId(db, {
      ...attributionInput,
      eventCode: GRANT_ISSUED_EVENT_CODE,
    }),
    loadLatestPrincipalChainActorsByResourceId(db, {
      ...attributionInput,
      eventCode: GRANT_CONSUMED_EVENT_CODE,
    }),
  ]);
  return { issuedByGrantId, consumedByGrantId };
}

function mapGrantRow(
  row: RawGrantRow,
  issuedByGrantId: Map<string, PrincipalChainActorRow>,
  consumedByGrantId: Map<string, PrincipalChainActorRow>,
): ProjectInjectionGrantRow | null {
  const parsedGrantId = injectionGrantId.parse(row.grantId);
  const parsedOrganizationId = organizationId.parse(row.organizationId);
  const parsedProjectId = projectId.parse(row.projectId);
  const parsedEnvironmentId = environmentId.parse(row.environmentId);
  if (
    !parsedGrantId.ok ||
    !parsedOrganizationId.ok ||
    !parsedProjectId.ok ||
    !parsedEnvironmentId.ok
  ) {
    return null;
  }

  const variableKeys = row.variableKeys.filter(
    (key): key is VariableKey => typeof key === "string" && key.length > 0,
  );
  const issuedByActor = issuedByGrantId.get(row.grantId);
  const consumedByActor = consumedByGrantId.get(row.grantId);

  return {
    grantId: parsedGrantId.value,
    organizationId: parsedOrganizationId.value,
    projectId: parsedProjectId.value,
    environmentId: parsedEnvironmentId.value,
    variableKeys,
    status: deriveGrantStatus(row),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    revokedAt: row.revokedAt,
    revokedReason: parseRevokedReason(row.revokedReason),
    ...(issuedByActor === undefined ? {} : { issuedByActor }),
    ...(consumedByActor === undefined ? {} : { consumedByActor }),
  };
}

/** Lists project-scoped injection grants with principal-chain attribution from audit metadata. */
export async function listProjectInjectionGrantRows(
  db: TenantScopedDb,
  input: ListProjectInjectionGrantsInput,
): Promise<readonly ProjectInjectionGrantRow[]> {
  const grantRows = await loadRawProjectGrantRows(db, input);
  if (grantRows.length === 0) {
    return [];
  }

  const grantIds = grantRows.map((row) => row.grantId);
  const { issuedByGrantId, consumedByGrantId } = await loadGrantAttributionMaps(
    db,
    input,
    grantIds,
  );

  return grantRows
    .map((row) => mapGrantRow(row, issuedByGrantId, consumedByGrantId))
    .filter((row): row is ProjectInjectionGrantRow => row !== null);
}
