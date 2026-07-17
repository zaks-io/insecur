/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 * Delivery Risk Policy Presets and Preview Automation Opt-Ins (ADR-0043, INS-88).
 */
/* Stryker disable ObjectLiteral */
import { check, integer, pgTable, sql, text, timestamp, unique } from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";
import {
  orgProjectAndEnvironmentForeignKeys,
  orgProjectForeignKey,
} from "./tenant-org-scope-foreign-keys.js";

export const DELIVERY_RISK_POLICY_PRESET_KEYS = [
  "strict",
  "balanced",
  "automation_friendly",
] as const;

/** One active Delivery Risk Policy record per Project; changes bump policy_version and are audited. */
export const deliveryRiskPolicies = pgTable(
  "delivery_risk_policies",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    presetKey: text("preset_key").notNull(),
    presetVersion: integer("preset_version").notNull(),
    policyVersion: integer("policy_version").notNull().default(1),
    selectedByUserId: text("selected_by_user_id").notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("delivery_risk_policies_org_id_project_id_key").on(table.orgId, table.projectId),
    unique("delivery_risk_policies_org_id_id_key").on(table.orgId, table.id),
    orgProjectForeignKey("delivery_risk_policies", table),
    check(
      "delivery_risk_policies_preset_key_check",
      sql`${table.presetKey} IN ('strict', 'balanced', 'automation_friendly')`,
    ),
    check("delivery_risk_policies_preset_version_check", sql`${table.presetVersion} >= 1`),
    check("delivery_risk_policies_policy_version_check", sql`${table.policyVersion} >= 1`),
  ],
);

/**
 * Per-Environment Preview Automation Opt-In (ADR-0043): one row per preview Environment recording
 * who enabled preview automation and when. Revocation keeps the row (revoked_at set); re-enable
 * refreshes the enabled fields. Full change history lives in audit events.
 */
export const previewAutomationOptIns = pgTable(
  "preview_automation_opt_ins",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    enabledByUserId: text("enabled_by_user_id").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("preview_automation_opt_ins_org_id_environment_id_key").on(
      table.orgId,
      table.environmentId,
    ),
    unique("preview_automation_opt_ins_org_id_id_key").on(table.orgId, table.id),
    ...orgProjectAndEnvironmentForeignKeys("preview_automation_opt_ins", table),
    check(
      "preview_automation_opt_ins_revocation_pair_check",
      sql`(${table.revokedAt} IS NULL AND ${table.revokedByUserId} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revokedByUserId} IS NOT NULL)`,
    ),
  ],
);
