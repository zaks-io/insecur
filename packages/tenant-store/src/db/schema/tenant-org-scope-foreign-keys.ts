/**
 * Shared org-scoped composite foreign keys used across tenant-store schema tables.
 */
import type { AnyPgColumn, ForeignKeyBuilder } from "drizzle-orm/pg-core";
import { foreignKey } from "./pg-core.js";
import { environments, projects } from "./tenant-hierarchy.js";

interface OrgProjectForeignKeyColumns {
  orgId: AnyPgColumn;
  projectId: AnyPgColumn;
}

interface OrgEnvironmentForeignKeyColumns {
  orgId: AnyPgColumn;
  environmentId: AnyPgColumn;
}

export function orgProjectForeignKey(table: OrgProjectForeignKeyColumns): ForeignKeyBuilder {
  return foreignKey({
    columns: [table.orgId, table.projectId],
    foreignColumns: [projects.orgId, projects.id],
  });
}

export function orgEnvironmentForeignKey(
  table: OrgEnvironmentForeignKeyColumns,
): ForeignKeyBuilder {
  return foreignKey({
    columns: [table.orgId, table.environmentId],
    foreignColumns: [environments.orgId, environments.id],
  });
}

export function orgProjectAndEnvironmentForeignKeys(
  table: OrgProjectForeignKeyColumns & OrgEnvironmentForeignKeyColumns,
): ForeignKeyBuilder[] {
  return [orgProjectForeignKey(table), orgEnvironmentForeignKey(table)];
}
