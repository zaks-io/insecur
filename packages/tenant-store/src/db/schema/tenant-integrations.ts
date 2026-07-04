/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
/* Stryker disable ObjectLiteral */
import { primaryKey } from "drizzle-orm/pg-core";
import { check, foreignKey, integer, pgTable, sql, text, timestamp, unique } from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";

export const APP_CONNECTION_STATUSES = [
  "active",
  "disconnected",
  "reauthorization_required",
  "pending_setup",
] as const;

export const APP_CONNECTION_METHODS = [
  "github-app",
  "scoped-api-token",
  "vercel-integration-oauth",
] as const;

export const APP_CONNECTION_PROVIDERS = ["github", "cloudflare", "vercel"] as const;

export const appConnections = pgTable(
  "app_connections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text("provider").notNull(),
    connectionMethod: text("connection_method").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("pending_setup"),
    setupUserId: text("setup_user_id").notNull(),
    activeCredentialId: text("active_credential_id"),
    statusReasonCode: text("status_reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("app_connections_org_id_id_key").on(table.orgId, table.id),
    check(
      "app_connections_provider_check",
      sql`${table.provider} ~ '^[a-z][a-z0-9_-]+$' AND char_length(${table.provider}) <= 64`,
    ),
    check(
      "app_connections_connection_method_check",
      sql`${table.connectionMethod} IN ('github-app', 'scoped-api-token', 'vercel-integration-oauth')`,
    ),
    check(
      "app_connections_status_check",
      sql`${table.status} IN ('active', 'disconnected', 'reauthorization_required', 'pending_setup')`,
    ),
  ],
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    appConnectionId: text("app_connection_id").notNull(),
    provider: text("provider").notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version").notNull(),
    ciphertextStorageRef: text("ciphertext_storage_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("provider_credentials_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
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
