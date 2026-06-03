/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "./pg-core.js";
export const instances = pgTable("instances", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("organizations_instance_id_id_key").on(table.instanceId, table.id)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("projects_org_id_id_key").on(table.orgId, table.id)],
);

export const environments = pgTable(
  "environments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    displayName: text("display_name").notNull(),
    isProtected: boolean("is_protected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("environments_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("teams_org_id_id_key").on(table.orgId, table.id)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    teamId: text("team_id"),
    userId: text("user_id").notNull(),
    rolePreset: text("role_preset").notNull(),
    projectId: text("project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }),
    foreignKey({
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ],
);

export const organizationDataKeys = pgTable(
  "organization_data_keys",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    keyVersion: integer("key_version").notNull(),
    status: text("status").notNull(),
    rootKeyVersion: integer("root_key_version").notNull().default(1),
    wrappedStorageRef: text("wrapped_storage_ref"),
    custodyEvidenceRef: text("custody_evidence_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("organization_data_keys_org_id_key_version_key").on(table.orgId, table.keyVersion),
    check(
      "organization_data_keys_status_check",
      sql`${table.status} IN ('active', 'retired', 'revoked')`,
    ),
    uniqueIndex("organization_data_keys_one_active_per_org")
      .on(table.orgId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const projectDataKeys = pgTable(
  "project_data_keys",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    keyVersion: integer("key_version").notNull(),
    status: text("status").notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version").notNull().default(1),
    wrappedStorageRef: text("wrapped_storage_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_data_keys_project_id_key_version_key").on(table.projectId, table.keyVersion),
    foreignKey({
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      columns: [table.orgId, table.organizationDataKeyVersion],
      foreignColumns: [organizationDataKeys.orgId, organizationDataKeys.keyVersion],
    }),
    check(
      "project_data_keys_status_check",
      sql`${table.status} IN ('active', 'retired', 'revoked')`,
    ),
    uniqueIndex("project_data_keys_one_active_per_project")
      .on(table.orgId, table.projectId)
      .where(sql`${table.status} = 'active'`),
  ],
);
