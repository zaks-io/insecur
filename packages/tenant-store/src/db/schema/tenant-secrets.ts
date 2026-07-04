/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
/* Stryker disable ObjectLiteral */
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
import { organizations } from "./tenant-hierarchy.js";
import { orgProjectAndEnvironmentForeignKeys } from "./tenant-org-scope-foreign-keys.js";

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
    liveVersionNumber: integer("live_version_number").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("secrets_environment_id_variable_key_key").on(table.environmentId, table.variableKey),
    unique("secrets_org_id_id_key").on(table.orgId, table.id),
    ...orgProjectAndEnvironmentForeignKeys(table),
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
    lifecycleState: text("lifecycle_state").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    sql`CHECK (${table.lifecycleState} IN ('draft', 'live', 'retained', 'discarded'))`,
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

/** Deferred so `runtimeInjectionPolicyVersions` exists before the active-version FK is attached. */
const runtimeInjectionPoliciesDeferredConstraints: ForeignKeyBuilder[] = [];

export const runtimeInjectionPolicies = pgTable(
  "runtime_injection_policies",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    displayName: text("display_name").notNull(),
    activeVersionId: text("active_version_id"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("runtime_injection_policies_environment_id_display_name_key").on(
      table.environmentId,
      table.displayName,
    ),
    unique("runtime_injection_policies_org_id_id_key").on(table.orgId, table.id),
    ...orgProjectAndEnvironmentForeignKeys(table),
    ...runtimeInjectionPoliciesDeferredConstraints,
  ],
);

export const runtimeInjectionPolicyVersions = pgTable(
  "runtime_injection_policy_versions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    policyId: text("policy_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    displayNameSnapshot: text("display_name_snapshot").notNull(),
    secretIds: text("secret_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    variableKeys: text("variable_keys")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    command: text("command").notNull(),
    commandFingerprint: text("command_fingerprint"),
    ttlSeconds: integer("ttl_seconds").notNull(),
    deliveryMode: text("delivery_mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("runtime_injection_policy_versions_policy_id_version_number_key").on(
      table.policyId,
      table.versionNumber,
    ),
    unique("runtime_injection_policy_versions_org_id_policy_id_id_key").on(
      table.orgId,
      table.policyId,
      table.id,
    ),
    foreignKey({
      columns: [table.orgId, table.policyId],
      foreignColumns: [runtimeInjectionPolicies.orgId, runtimeInjectionPolicies.id],
    }),
  ],
);

runtimeInjectionPoliciesDeferredConstraints.push(
  foreignKey({
    name: "runtime_injection_policies_org_id_id_active_version_id_fkey",
    columns: [
      runtimeInjectionPolicies.orgId,
      runtimeInjectionPolicies.id,
      runtimeInjectionPolicies.activeVersionId,
    ],
    foreignColumns: [
      runtimeInjectionPolicyVersions.orgId,
      runtimeInjectionPolicyVersions.policyId,
      runtimeInjectionPolicyVersions.id,
    ],
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
  (table) => orgProjectAndEnvironmentForeignKeys(table),
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

export const firstValueFeedback = pgTable("first_value_feedback", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  actorUserId: text("actor_user_id").notNull(),
  feedbackKind: text("feedback_kind").notNull(),
  note: text("note").notNull(),
  grantId: text("grant_id"),
  operationId: text("operation_id"),
  requestId: text("request_id"),
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
