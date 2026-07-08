/**
 * Protected Change Orchestrator persistence (INS-82 / AUX-01).
 */
/* Stryker disable ObjectLiteral */
import { check, foreignKey, jsonb, pgTable, sql, text, timestamp, uniqueIndex } from "./pg-core.js";
import { orgEnvironmentFkey, orgProjectFkey } from "./pg-identifier-names.js";
import { environments, organizations, projects } from "./tenant-hierarchy.js";

export const PROTECTED_CHANGE_PURPOSES = ["promotion"] as const;

export const PROTECTED_CHANGE_RECORD_STATES = [
  "proposed",
  "pending_approval",
  "approved",
  "rejected",
  "stale",
  "canceled",
  "executing",
  "succeeded",
  "failed",
] as const;

export const PROTECTED_CHANGE_ACTIVE_STATES = [
  "proposed",
  "pending_approval",
  "approved",
  "executing",
] as const;

export const protectedChanges = pgTable(
  "protected_changes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environments.id),
    state: text("state").notNull(),
    purpose: text("purpose").notNull().default("promotion"),
    requesterUserId: text("requester_user_id"),
    requesterMachineIdentityId: text("requester_machine_identity_id"),
    draftVersionIds: jsonb("draft_version_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    impactReviewFingerprint: text("impact_review_fingerprint"),
    executionOperationId: text("execution_operation_id"),
    closureReasonCode: text("closure_reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("protected_changes_org_id_id_key").on(table.orgId, table.id),
    uniqueIndex("protected_changes_one_active_per_environment_idx")
      .on(table.orgId, table.environmentId)
      .where(sql`${table.state} IN ('proposed', 'pending_approval', 'approved', 'executing')`),
    foreignKey({
      name: orgProjectFkey("protected_changes"),
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      name: orgEnvironmentFkey("protected_changes"),
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
    check(
      "protected_changes_state_check",
      sql`${table.state} IN ('proposed', 'pending_approval', 'approved', 'rejected', 'stale', 'canceled', 'executing', 'succeeded', 'failed')`,
    ),
    check("protected_changes_purpose_check", sql`${table.purpose} IN ('promotion')`),
    check(
      "protected_changes_requester_present_check",
      sql`${table.requesterUserId} IS NOT NULL OR ${table.requesterMachineIdentityId} IS NOT NULL`,
    ),
  ],
);

export const protectedChangeApprovalEvidence = pgTable(
  "protected_change_approval_evidence",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    protectedChangeId: text("protected_change_id").notNull(),
    approverUserId: text("approver_user_id").notNull(),
    auditEventId: text("audit_event_id").notNull(),
    operationId: text("operation_id"),
    impactReviewFingerprint: text("impact_review_fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("protected_change_approval_evidence_org_change_key").on(
      table.orgId,
      table.protectedChangeId,
    ),
    foreignKey({
      name: "pc_approval_evidence_org_change_fkey",
      columns: [table.orgId, table.protectedChangeId],
      foreignColumns: [protectedChanges.orgId, protectedChanges.id],
    }),
  ],
);
