/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
/* Stryker disable ObjectLiteral */
import type { ForeignKeyBuilder } from "drizzle-orm/pg-core";
import {
  foreignKey,
  check,
  integer,
  jsonb,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
  uniqueIndex,
  boolean,
} from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";
import { machineIdentities } from "./tenant-machine-auth-methods.js";
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
    ...orgProjectAndEnvironmentForeignKeys("secrets", table),
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
    createdByActorType: text("created_by_actor_type"),
    createdByUserId: text("created_by_user_id"),
    createdByMachineIdentityId: text("created_by_machine_identity_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    valueByteLength: integer("value_byte_length").notNull(),
    encodingClass: text("encoding_class").notNull(),
    isEmpty: boolean("is_empty").notNull(),
    hasLeadingOrTrailingWhitespace: boolean("has_leading_or_trailing_whitespace").notNull(),
    looksLikePlaceholder: boolean("looks_like_placeholder").notNull(),
    secretShapeMatchVerdict: text("secret_shape_match_verdict").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    sql`CHECK (${table.lifecycleState} IN ('draft', 'live', 'retained', 'discarded'))`,
    sql`CHECK (${table.createdByActorType} IS NULL OR ${table.createdByActorType} IN ('user', 'machine'))`,
    sql`CHECK ((${table.createdByActorType} = 'user' AND ${table.createdByUserId} IS NOT NULL AND ${table.createdByMachineIdentityId} IS NULL) OR (${table.createdByActorType} = 'machine' AND ${table.createdByMachineIdentityId} IS NOT NULL AND ${table.createdByUserId} IS NULL) OR (${table.createdByActorType} IS NULL AND ${table.createdByUserId} IS NULL AND ${table.createdByMachineIdentityId} IS NULL))`,
    sql`CHECK (${table.encodingClass} IN ('utf-8', 'hex-shaped', 'base64-shaped'))`,
    sql`CHECK (${table.secretShapeMatchVerdict} IN ('matches', 'does_not_match', 'no_shape_rule'))`,
    unique("secret_versions_secret_id_version_number_key").on(table.secretId, table.versionNumber),
    unique("secret_versions_org_id_secret_id_id_key").on(table.orgId, table.secretId, table.id),
    foreignKey({
      name: "secret_versions_org_secret_fkey",
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
    ...orgProjectAndEnvironmentForeignKeys("runtime_injection_policies", table),
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
      name: "rt_inj_pol_ver_org_policy_fkey",
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
    secretVersionIds: text("secret_version_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    policyId: text("policy_id"),
    policyVersionId: text("policy_version_id"),
    issuedActorType: text("issued_actor_type").notNull(),
    issuedUserId: text("issued_user_id"),
    issuedMachineIdentityId: text("issued_machine_identity_id"),
    issuedRuntimePolicyKeyId: text("issued_runtime_policy_key_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    ...orgProjectAndEnvironmentForeignKeys("injection_grants", table),
    sql`CHECK (${table.revokedReason} IS NULL OR ${table.revokedReason} IN ('tenant_suspension', 'compromise_version_invalidation'))`,
    check(
      "injection_grants_issued_actor_type_check",
      sql`${table.issuedActorType} IN ('user', 'machine')`,
    ),
    check(
      "injection_grants_issued_actor_shape_check",
      sql`
      (${table.issuedActorType} = 'user' AND ${table.issuedUserId} IS NOT NULL AND ${table.issuedMachineIdentityId} IS NULL AND ${table.issuedRuntimePolicyKeyId} IS NULL)
      OR
      (${table.issuedActorType} = 'machine' AND ${table.issuedUserId} IS NULL AND ${table.issuedMachineIdentityId} IS NOT NULL)
    `,
    ),
    foreignKey({
      name: "injection_grants_org_issued_machine_fkey",
      columns: [table.orgId, table.issuedMachineIdentityId],
      foreignColumns: [machineIdentities.orgId, machineIdentities.id],
    }),
    foreignKey({
      name: "injection_grants_org_issued_runtime_policy_fkey",
      columns: [table.orgId, table.issuedRuntimePolicyKeyId],
      foreignColumns: [runtimeInjectionPolicies.orgId, runtimeInjectionPolicies.id],
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
