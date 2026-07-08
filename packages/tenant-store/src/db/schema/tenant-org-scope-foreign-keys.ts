/**
 * Shared org-scoped composite foreign keys used across tenant-store schema tables.
 */
import type { AnyPgColumn, ForeignKeyBuilder } from "drizzle-orm/pg-core";
import { foreignKey } from "./pg-core.js";
import { orgEnvironmentFkey, orgProjectFkey } from "./pg-identifier-names.js";
import { environments, projects } from "./tenant-hierarchy.js";

interface OrgProjectForeignKeyColumns {
  orgId: AnyPgColumn;
  projectId: AnyPgColumn;
}

interface OrgEnvironmentForeignKeyColumns {
  orgId: AnyPgColumn;
  environmentId: AnyPgColumn;
}

export function orgProjectForeignKey(
  tableName: string,
  table: OrgProjectForeignKeyColumns,
): ForeignKeyBuilder {
  return foreignKey({
    name: orgProjectFkey(tableName),
    columns: [table.orgId, table.projectId],
    foreignColumns: [projects.orgId, projects.id],
  });
}

export function orgEnvironmentForeignKey(
  tableName: string,
  table: OrgEnvironmentForeignKeyColumns,
): ForeignKeyBuilder {
  return foreignKey({
    name: orgEnvironmentFkey(tableName),
    columns: [table.orgId, table.environmentId],
    foreignColumns: [environments.orgId, environments.id],
  });
}

export function orgProjectAndEnvironmentForeignKeys(
  tableName: string,
  table: OrgProjectForeignKeyColumns & OrgEnvironmentForeignKeyColumns,
): ForeignKeyBuilder[] {
  return [orgProjectForeignKey(tableName, table), orgEnvironmentForeignKey(tableName, table)];
}
