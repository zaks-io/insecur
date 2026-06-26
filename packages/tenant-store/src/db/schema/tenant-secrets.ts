/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
import type { ForeignKeyBuilder } from "drizzle-orm/pg-core";
import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "./pg-core.js";
import { environments, organizations, projects } from "./tenant-hierarchy.js";

/** Deferred so `secretVersions` exists before the composite current-version FK is attached. */
const secretsDeferredConstraints: ForeignKeyBuilder[] = [];

export const secrets = pgTable(
  "secrets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    variableKey: text("variable_key").notNull(),
    currentVersionId: text("current_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("secrets_environment_id_variable_key_key").on(table.environmentId, table.variableKey),
    unique("secrets_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
    ...secretsDeferredConstraints,
  ],
);

export const secretVersions = pgTable(
  "secret_versions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    secretId: text("secret_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version"),
    projectDataKeyVersion: integer("project_data_key_version"),
    ciphertextStorageRef: text("ciphertext_storage_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("secret_versions_secret_id_version_number_key").on(table.secretId, table.versionNumber),
    unique("secret_versions_org_id_secret_id_id_key").on(table.orgId, table.secretId, table.id),
    foreignKey({
      columns: [table.orgId, table.secretId],
      foreignColumns: [secrets.orgId, secrets.id],
    }),
  ],
);

secretsDeferredConstraints.push(
  foreignKey({
    name: "secrets_org_id_id_current_version_id_fkey",
    columns: [secrets.orgId, secrets.id, secrets.currentVersionId],
    foreignColumns: [secretVersions.orgId, secretVersions.secretId, secretVersions.id],
  }),
);

export const injectionGrants = pgTable(
  "injection_grants",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    variableKeys: text("variable_keys").array().notNull(),
    secretIds: text("secret_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    secretVersionId: text("secret_version_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
  ],
);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  eventCode: text("event_code").notNull(),
  outcome: text("outcome").notNull(),
  resultCode: text("result_code").notNull(),
  actorType: text("actor_type").notNull(),
  actorUserId: text("actor_user_id"),
  actorMachineIdentityId: text("actor_machine_identity_id"),
  projectId: text("project_id"),
  environmentId: text("environment_id"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  relatedResourceType: text("related_resource_type"),
  relatedResourceId: text("related_resource_id"),
  details: jsonb("details"),
  requestId: text("request_id"),
  operationId: text("operation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const operations = pgTable(
  "operations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    state: text("state").notNull(),
    intentCode: text("intent_code").notNull(),
    idempotencyKey: text("idempotency_key"),
    progress: jsonb("progress")
      .notNull()
      .default(sql`'{}'::jsonb`),
    executionDeadline: timestamp("execution_deadline", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("operations_org_idempotency_key_idx")
      .on(table.orgId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);
