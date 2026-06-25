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
  uniqueIndex,
} from "./pg-core.js";
import { instances, organizations } from "./tenant-hierarchy.js";
export const instanceConfigurations = pgTable("instance_configurations", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instances.id),
  signupLockdownEnabled: boolean("signup_lockdown_enabled").notNull().default(true),
  publicOnboardingEnabled: boolean("public_onboarding_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const instanceIdentityConfigurations = pgTable(
  "instance_identity_configurations",
  {
    instanceId: text("instance_id")
      .primaryKey()
      .references(() => instances.id),
    humanIdentityProvider: text("human_identity_provider").notNull(),
    workosClientId: text("workos_client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    firstOrganizationId: text("first_organization_id")
      .notNull()
      .references(() => organizations.id),
    status: text("status").notNull(),
    consumedByUserId: text("consumed_by_user_id"),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "bootstrap_operator_claims_status_check",
      sql`${table.status} IN ('pending', 'consumed')`,
    ),
    uniqueIndex("bootstrap_operator_claim_one_pending_per_instance")
      .on(table.instanceId)
      .where(sql`${table.status} = 'pending'`),
    foreignKey({
      name: "bootstrap_operator_claims_instance_id_first_organization_id_fkey",
      columns: [table.instanceId, table.firstOrganizationId],
      foreignColumns: [organizations.instanceId, organizations.id],
    }),
  ],
);

export const instanceOperators = pgTable(
  "instance_operators",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    userId: text("user_id").notNull(),
    grantOrigin: text("grant_origin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    algorithm: text("algorithm").notNull(),
    saltB64: text("salt_b64").notNull(),
    hashB64: text("hash_b64").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("bootstrap_secret_verifiers_algorithm_check", sql`${table.algorithm} IN ('scrypt_v1')`),
  ],
);

export const userAdmissions = pgTable(
  "user_admissions",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id),
    userId: text("user_id").notNull(),
    workosUserId: text("workos_user_id").notNull(),
    displayName: text("display_name"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check("user_admissions_status_check", sql`${table.status} IN ('active', 'revoked')`),
    check(
      "user_admissions_revocation_check",
      sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL)`,
    ),
    uniqueIndex("user_admissions_one_workos_subject_per_instance").on(
      table.instanceId,
      table.workosUserId,
    ),
    uniqueIndex("user_admissions_one_user_per_instance").on(table.instanceId, table.userId),
  ],
);
