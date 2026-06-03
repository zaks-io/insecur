/**
 * Drizzle schema source of truth (ADR-0037). Table DDL only — RLS policies and database
 * roles live in `sql/policies-and-roles.sql`. RLS ENABLE/FORCE is co-located in the generated
 * baseline migration SQL so tables are never committed without forced RLS.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" }).notNull().defaultNow();

export const instances = pgTable("instances", {
  id: text().primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamptz("created_at"),
});

export const organizations = pgTable(
  "organizations",
  {
    id: text().primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    displayName: text("display_name").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [unique("organizations_instance_id_id_key").on(table.instanceId, table.id)],
);

export const projects = pgTable(
  "projects",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [unique("projects_org_id_id_key").on(table.orgId, table.id)],
);

export const environments = pgTable(
  "environments",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    displayName: text("display_name").notNull(),
    isProtected: boolean("is_protected").notNull().default(false),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    unique("environments_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: "environments_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamptz("created_at"),
  },
  (table) => [unique("teams_org_id_id_key").on(table.orgId, table.id)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    teamId: text("team_id"),
    userId: text("user_id").notNull(),
    rolePreset: text("role_preset").notNull(),
    projectId: text("project_id"),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    foreignKey({
      name: "memberships_org_id_team_id_fkey",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }),
    foreignKey({
      name: "memberships_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ],
);

export const organizationDataKeys = pgTable(
  "organization_data_keys",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    keyVersion: integer("key_version").notNull(),
    status: text().notNull(),
    rootKeyVersion: integer("root_key_version").notNull().default(1),
    wrappedStorageRef: text("wrapped_storage_ref"),
    custodyEvidenceRef: text("custody_evidence_ref"),
    createdAt: timestamptz("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
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
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    keyVersion: integer("key_version").notNull(),
    status: text().notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version").notNull().default(1),
    wrappedStorageRef: text("wrapped_storage_ref"),
    createdAt: timestamptz("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("project_data_keys_project_id_key_version_key").on(table.projectId, table.keyVersion),
    foreignKey({
      name: "project_data_keys_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      name: "project_data_keys_org_key_version_fkey",
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

export const secrets = pgTable(
  "secrets",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    variableKey: text("variable_key").notNull(),
    currentVersionId: text("current_version_id"),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    unique("secrets_environment_id_variable_key_key").on(table.environmentId, table.variableKey),
    unique("secrets_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: "secrets_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      name: "secrets_org_id_environment_id_fkey",
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
  ],
);

export const secretVersions = pgTable(
  "secret_versions",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    secretId: text("secret_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version"),
    projectDataKeyVersion: integer("project_data_key_version"),
    ciphertextStorageRef: text("ciphertext_storage_ref").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    unique("secret_versions_secret_id_version_number_key").on(table.secretId, table.versionNumber),
    unique("secret_versions_org_id_secret_id_id_key").on(table.orgId, table.secretId, table.id),
    foreignKey({
      name: "secret_versions_org_id_secret_id_fkey",
      columns: [table.orgId, table.secretId],
      foreignColumns: [secrets.orgId, secrets.id],
    }),
  ],
);

export const injectionGrants = pgTable(
  "injection_grants",
  {
    id: text().primaryKey(),
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
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    foreignKey({
      name: "injection_grants_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      name: "injection_grants_org_id_environment_id_fkey",
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
  ],
);

export const auditEvents = pgTable("audit_events", {
  id: text().primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  eventCode: text("event_code").notNull(),
  outcome: text().notNull(),
  resultCode: text("result_code").notNull(),
  actorType: text("actor_type").notNull(),
  actorUserId: text("actor_user_id"),
  projectId: text("project_id"),
  environmentId: text("environment_id"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  relatedResourceType: text("related_resource_type"),
  relatedResourceId: text("related_resource_id"),
  details: jsonb(),
  requestId: text("request_id"),
  operationId: text("operation_id"),
  createdAt: timestamptz("created_at"),
});

export const operations = pgTable(
  "operations",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    state: text().notNull(),
    intentCode: text("intent_code").notNull(),
    idempotencyKey: text("idempotency_key"),
    progress: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamptz("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("operations_org_idempotency_key_idx")
      .on(table.orgId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    teamId: text("team_id").notNull(),
    inviteeUserId: text("invitee_user_id").notNull(),
    rolePreset: text("role_preset").notNull(),
    projectId: text("project_id"),
    status: text().notNull().default("pending"),
    membershipId: text("membership_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    foreignKey({
      name: "invitations_org_team_fkey",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }),
    foreignKey({
      name: "invitations_org_project_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    check("invitations_status_check", sql`${table.status} IN ('pending', 'accepted', 'revoked')`),
    check(
      "invitations_role_preset_check",
      sql`${table.rolePreset} IN ('owner', 'admin', 'developer', 'approval', 'read-only')`,
    ),
    uniqueIndex("invitations_one_pending_per_invitee_org_project")
      .on(table.orgId, table.inviteeUserId, table.projectId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const syncTargetLeases = pgTable(
  "sync_target_leases",
  {
    orgId: text("org_id").notNull(),
    projectId: text("project_id").notNull(),
    providerKind: text("provider_kind").notNull(),
    targetIdentity: text("target_identity").notNull(),
    heldByOperationId: text("held_by_operation_id")
      .notNull()
      .references(() => operations.id),
    fencingToken: bigint("fencing_token", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamptz("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "sync_target_leases_pkey",
      columns: [table.orgId, table.projectId, table.providerKind, table.targetIdentity],
    }),
    foreignKey({
      name: "sync_target_leases_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    check("sync_target_leases_fencing_token_positive", sql`${table.fencingToken} > 0`),
    uniqueIndex("sync_target_leases_held_by_operation_id_idx").on(
      table.orgId,
      table.heldByOperationId,
    ),
  ],
);

export const machineIdentities = pgTable(
  "machine_identities",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    status: text().notNull().default("active"),
    createdAt: timestamptz("created_at"),
  },
  (table) => [unique("machine_identities_org_id_id_key").on(table.orgId, table.id)],
);

export const machineIdentityMemberships = pgTable(
  "machine_identity_memberships",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    machineIdentityId: text("machine_identity_id").notNull(),
    projectId: text("project_id").notNull(),
    authorizationScopes: text("authorization_scopes").array().notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    unique("machine_identity_memberships_org_id_id_key").on(table.orgId, table.id),
    unique("machine_identity_memberships_org_id_machine_identity_id_project_id_key").on(
      table.orgId,
      table.machineIdentityId,
      table.projectId,
    ),
    foreignKey({
      name: "machine_identity_memberships_org_id_machine_identity_id_fkey",
      columns: [table.orgId, table.machineIdentityId],
      foreignColumns: [machineIdentities.orgId, machineIdentities.id],
    }),
    foreignKey({
      name: "machine_identity_memberships_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    check("machine_identity_memberships_project_scoped", sql`${table.projectId} IS NOT NULL`),
    check(
      "machine_identity_memberships_scopes_nonempty",
      sql`cardinality(${table.authorizationScopes}) > 0`,
    ),
  ],
);

export const appConnections = pgTable(
  "app_connections",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text().notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    unique("app_connections_org_id_id_key").on(table.orgId, table.id),
    check(
      "app_connections_provider_check",
      sql`${table.provider} ~ '^[a-z][a-z0-9_-]+$' AND char_length(${table.provider}) <= 64`,
    ),
  ],
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: text().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    appConnectionId: text("app_connection_id").notNull(),
    provider: text().notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version").notNull(),
    ciphertextStorageRef: text("ciphertext_storage_ref").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    unique("provider_credentials_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: "provider_credentials_org_id_app_connection_id_fkey",
      columns: [table.orgId, table.appConnectionId],
      foreignColumns: [appConnections.orgId, appConnections.id],
    }),
    check(
      "provider_credentials_provider_check",
      sql`${table.provider} ~ '^[a-z][a-z0-9_-]+$' AND char_length(${table.provider}) <= 64`,
    ),
  ],
);

export const sensitiveMetadataFields = pgTable(
  "sensitive_metadata_fields",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    scopeProjectId: text("scope_project_id").notNull().default(""),
    metadataType: text("metadata_type").notNull(),
    recordResourceId: text("record_resource_id").notNull(),
    fieldKey: text("field_key").notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version").notNull(),
    projectDataKeyVersion: integer("project_data_key_version"),
    ciphertextStorageRef: text("ciphertext_storage_ref").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    primaryKey({
      name: "sensitive_metadata_fields_pkey",
      columns: [
        table.orgId,
        table.scopeProjectId,
        table.metadataType,
        table.recordResourceId,
        table.fieldKey,
      ],
    }),
    check(
      "sensitive_metadata_fields_metadata_type_check",
      sql`${table.metadataType} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' AND char_length(${table.metadataType}) <= 128`,
    ),
    check(
      "sensitive_metadata_fields_field_key_check",
      sql`${table.fieldKey} ~ '^[a-z][a-z0-9_]+$' AND char_length(${table.fieldKey}) <= 64`,
    ),
    check(
      "sensitive_metadata_fields_scope_project_id_check",
      sql`${table.scopeProjectId} = '' OR ${table.scopeProjectId} ~ '^prj_[0-9A-Z]{26}$'`,
    ),
  ],
);

export const instanceConfigurations = pgTable("instance_configurations", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instances.id),
  signupLockdownEnabled: boolean("signup_lockdown_enabled").notNull().default(true),
  publicOnboardingEnabled: boolean("public_onboarding_enabled").notNull().default(false),
  createdAt: timestamptz("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const instanceIdentityConfigurations = pgTable(
  "instance_identity_configurations",
  {
    instanceId: text("instance_id")
      .primaryKey()
      .references(() => instances.id),
    humanIdentityProvider: text("human_identity_provider").notNull(),
    workosClientId: text("workos_client_id").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    check(
      "instance_identity_configurations_provider_check",
      sql`${table.humanIdentityProvider} IN ('workos_authkit')`,
    ),
  ],
);

export const bootstrapOperatorClaims = pgTable(
  "bootstrap_operator_claims",
  {
    id: text().primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    firstOrganizationId: text("first_organization_id")
      .notNull()
      .references(() => organizations.id),
    status: text().notNull(),
    consumedByUserId: text("consumed_by_user_id"),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    check(
      "bootstrap_operator_claims_status_check",
      sql`${table.status} IN ('pending', 'consumed')`,
    ),
    foreignKey({
      name: "bootstrap_operator_claims_instance_id_first_organization_id_fkey",
      columns: [table.instanceId, table.firstOrganizationId],
      foreignColumns: [organizations.instanceId, organizations.id],
    }),
    uniqueIndex("bootstrap_operator_claim_one_pending_per_instance")
      .on(table.instanceId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const instanceOperators = pgTable(
  "instance_operators",
  {
    id: text().primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    userId: text("user_id").notNull(),
    grantOrigin: text("grant_origin").notNull(),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    check(
      "instance_operators_grant_origin_check",
      sql`${table.grantOrigin} IN ('bootstrap', 'admin')`,
    ),
    uniqueIndex("instance_operators_one_bootstrap_per_instance")
      .on(table.instanceId)
      .where(sql`${table.grantOrigin} = 'bootstrap'`),
  ],
);

export const bootstrapSecretVerifiers = pgTable(
  "bootstrap_secret_verifiers",
  {
    instanceId: text("instance_id")
      .primaryKey()
      .references(() => instances.id),
    secretVersion: integer("secret_version").notNull().default(1),
    algorithm: text().notNull(),
    saltB64: text("salt_b64").notNull(),
    hashB64: text("hash_b64").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamptz("created_at"),
  },
  (table) => [
    check("bootstrap_secret_verifiers_algorithm_check", sql`${table.algorithm} IN ('scrypt_v1')`),
  ],
);
