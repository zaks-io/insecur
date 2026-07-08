import { and, eq, inArray } from "drizzle-orm";
import { machineIdentityId, organizationId, parseDisplayName } from "@insecur/domain";

import {
  machineIdentities,
  machineIdentityEnvironmentDeployKeys,
  machineIdentityGitHubActionsOidc,
  machineIdentityMemberships,
} from "../db/schema/tenant-machine-auth-methods.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  toEnvironmentDeployKeyRow,
  toGitHubActionsOidcRow,
} from "./project-machine-identity-row-mappers.js";
import type {
  EnvironmentDeployKeyAuthMethodRow,
  GitHubActionsOidcAuthMethodRow,
  ListProjectMachineIdentitiesInput,
  ProjectMachineIdentityRow,
} from "./project-machine-identity-types.js";

function parseMachineIdentityStatus(value: string): "active" | "disabled" | null {
  return value === "active" || value === "disabled" ? value : null;
}

async function loadProjectMachineIdentityIds(
  db: TenantScopedDb,
  input: ListProjectMachineIdentitiesInput,
): Promise<readonly string[]> {
  const membershipRows = await db
    .select({ machineIdentityId: machineIdentityMemberships.machineIdentityId })
    .from(machineIdentityMemberships)
    .where(
      and(
        eq(machineIdentityMemberships.orgId, input.organizationId),
        eq(machineIdentityMemberships.projectId, input.projectId),
      ),
    );
  return [...new Set(membershipRows.map((row) => row.machineIdentityId))];
}

function groupAuthMethodsByMachineId<TRow>(
  rows: readonly TRow[],
  machineIdentityIdFor: (row: TRow) => string,
  mapRow: (row: TRow) => GitHubActionsOidcAuthMethodRow | EnvironmentDeployKeyAuthMethodRow | null,
): Map<string, (GitHubActionsOidcAuthMethodRow | EnvironmentDeployKeyAuthMethodRow)[]> {
  const byMachineId = new Map<
    string,
    (GitHubActionsOidcAuthMethodRow | EnvironmentDeployKeyAuthMethodRow)[]
  >();
  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped) {
      continue;
    }
    const key = machineIdentityIdFor(row);
    const existing = byMachineId.get(key) ?? [];
    existing.push(mapped);
    byMachineId.set(key, existing);
  }
  return byMachineId;
}

async function loadGitHubActionsOidcRows(
  db: TenantScopedDb,
  input: ListProjectMachineIdentitiesInput,
) {
  return db
    .select({
      id: machineIdentityGitHubActionsOidc.id,
      machineIdentityId: machineIdentityGitHubActionsOidc.machineIdentityId,
      environmentId: machineIdentityGitHubActionsOidc.environmentId,
      githubRepository: machineIdentityGitHubActionsOidc.githubRepository,
      githubEnvironment: machineIdentityGitHubActionsOidc.githubEnvironment,
      status: machineIdentityGitHubActionsOidc.status,
      createdAt: machineIdentityGitHubActionsOidc.createdAt,
    })
    .from(machineIdentityGitHubActionsOidc)
    .where(
      and(
        eq(machineIdentityGitHubActionsOidc.orgId, input.organizationId),
        eq(machineIdentityGitHubActionsOidc.projectId, input.projectId),
      ),
    );
}

async function loadEnvironmentDeployKeyRows(
  db: TenantScopedDb,
  input: ListProjectMachineIdentitiesInput,
) {
  return db
    .select({
      id: machineIdentityEnvironmentDeployKeys.id,
      machineIdentityId: machineIdentityEnvironmentDeployKeys.machineIdentityId,
      environmentId: machineIdentityEnvironmentDeployKeys.environmentId,
      status: machineIdentityEnvironmentDeployKeys.status,
      nonExpiring: machineIdentityEnvironmentDeployKeys.nonExpiring,
      expiresAt: machineIdentityEnvironmentDeployKeys.expiresAt,
      rotationIntervalSeconds: machineIdentityEnvironmentDeployKeys.rotationIntervalSeconds,
      rotationReminderIntervalSeconds:
        machineIdentityEnvironmentDeployKeys.rotationReminderIntervalSeconds,
      createdAt: machineIdentityEnvironmentDeployKeys.createdAt,
    })
    .from(machineIdentityEnvironmentDeployKeys)
    .where(
      and(
        eq(machineIdentityEnvironmentDeployKeys.orgId, input.organizationId),
        eq(machineIdentityEnvironmentDeployKeys.projectId, input.projectId),
      ),
    );
}

async function loadProjectAuthMethods(
  db: TenantScopedDb,
  input: ListProjectMachineIdentitiesInput,
): Promise<{
  readonly oidcByMachineId: Map<string, GitHubActionsOidcAuthMethodRow[]>;
  readonly deployKeysByMachineId: Map<string, EnvironmentDeployKeyAuthMethodRow[]>;
}> {
  const [oidcRows, deployKeyRows] = await Promise.all([
    loadGitHubActionsOidcRows(db, input),
    loadEnvironmentDeployKeyRows(db, input),
  ]);

  return {
    oidcByMachineId: groupAuthMethodsByMachineId(
      oidcRows,
      (row) => row.machineIdentityId,
      toGitHubActionsOidcRow,
    ) as Map<string, GitHubActionsOidcAuthMethodRow[]>,
    deployKeysByMachineId: groupAuthMethodsByMachineId(
      deployKeyRows,
      (row) => row.machineIdentityId,
      toEnvironmentDeployKeyRow,
    ) as Map<string, EnvironmentDeployKeyAuthMethodRow[]>,
  };
}

function toProjectMachineIdentityRow(
  row: {
    readonly machineIdentityId: string;
    readonly organizationId: string;
    readonly displayName: string;
    readonly status: string;
    readonly createdAt: Date;
  },
  oidcByMachineId: Map<string, GitHubActionsOidcAuthMethodRow[]>,
  deployKeysByMachineId: Map<string, EnvironmentDeployKeyAuthMethodRow[]>,
): ProjectMachineIdentityRow | null {
  const parsedOrganizationId = organizationId.parse(row.organizationId);
  const parsedMachineIdentityId = machineIdentityId.parse(row.machineIdentityId);
  const parsedDisplayName = parseDisplayName(row.displayName);
  const parsedStatus = parseMachineIdentityStatus(row.status);
  if (
    !parsedOrganizationId.ok ||
    !parsedMachineIdentityId.ok ||
    !parsedDisplayName.ok ||
    !parsedStatus
  ) {
    return null;
  }
  return {
    machineIdentityId: parsedMachineIdentityId.value,
    organizationId: parsedOrganizationId.value,
    displayName: parsedDisplayName.value,
    status: parsedStatus,
    createdAt: row.createdAt,
    githubActionsOidcMethods: oidcByMachineId.get(row.machineIdentityId) ?? [],
    environmentDeployKeyMethods: deployKeysByMachineId.get(row.machineIdentityId) ?? [],
  };
}

/** Lists project-scoped machine identities and metadata-safe auth method rows (no credential material). */
export async function listProjectMachineIdentityRows(
  db: TenantScopedDb,
  input: ListProjectMachineIdentitiesInput,
): Promise<readonly ProjectMachineIdentityRow[]> {
  const uniqueMachineIdentityIds = await loadProjectMachineIdentityIds(db, input);
  if (uniqueMachineIdentityIds.length === 0) {
    return [];
  }

  const [identityRows, authMethods] = await Promise.all([
    db
      .select({
        machineIdentityId: machineIdentities.id,
        organizationId: machineIdentities.orgId,
        displayName: machineIdentities.displayName,
        status: machineIdentities.status,
        createdAt: machineIdentities.createdAt,
      })
      .from(machineIdentities)
      .where(
        and(
          eq(machineIdentities.orgId, input.organizationId),
          inArray(machineIdentities.id, uniqueMachineIdentityIds),
        ),
      ),
    loadProjectAuthMethods(db, input),
  ]);

  const rows = identityRows
    .map((row) =>
      toProjectMachineIdentityRow(
        row,
        authMethods.oidcByMachineId,
        authMethods.deployKeysByMachineId,
      ),
    )
    .filter((row): row is ProjectMachineIdentityRow => row !== null);

  return rows.sort((left, right) => left.displayName.localeCompare(right.displayName));
}
