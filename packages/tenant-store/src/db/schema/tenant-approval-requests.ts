/**
 * Protected Change Orchestrator approval request tables (INS-82/84/439).
 */
/* Stryker disable ObjectLiteral */
import { primaryKey } from "drizzle-orm/pg-core";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
  boolean,
} from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";
import { orgProjectAndEnvironmentForeignKeys } from "./tenant-org-scope-foreign-keys.js";
import { secretVersions, secrets } from "./tenant-secrets.js";

export const APPROVAL_REQUEST_STATUSES = [
  "pending",
  "approved_applied",
  "rejected",
  "canceled",
  "superseded",
  "policy_stale",
  "requester_access_stale",
  "target_closed",
  "draft_discard_closed",
] as const;

export const APPROVAL_REQUEST_PURPOSES = ["protected_promotion", "protected_rollback"] as const;

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status").notNull().default("pending"),
    requesterUserId: text("requester_user_id"),
    requesterMachineIdentityId: text("requester_machine_identity_id"),
    operationId: text("operation_id"),
    impactReviewFingerprint: text("impact_review_fingerprint"),
    commentLength: integer("comment_length"),
    commentSha256: text("comment_sha256"),
    rollbackSecretId: text("rollback_secret_id"),
    rollbackToVersionId: text("rollback_to_version_id"),
    rollbackPromoteRequested: boolean("rollback_promote_requested").notNull().default(false),
    supersededByRequestId: text("superseded_by_request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("approval_requests_org_id_id_key").on(table.orgId, table.id),
    check(
      "approval_requests_status_check",
      sql`${table.status} IN ('pending', 'approved_applied', 'rejected', 'canceled', 'superseded', 'policy_stale', 'requester_access_stale', 'target_closed', 'draft_discard_closed')`,
    ),
    check(
      "approval_requests_purpose_check",
      sql`${table.purpose} IN ('protected_promotion', 'protected_rollback')`,
    ),
    check(
      "approval_requests_requester_present_check",
      sql`${table.requesterUserId} IS NOT NULL OR ${table.requesterMachineIdentityId} IS NOT NULL`,
    ),
    ...orgProjectAndEnvironmentForeignKeys(table),
  ],
);

export const promotionChangeSetDraftVersions = pgTable(
  "promotion_change_set_draft_versions",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    approvalRequestId: text("approval_request_id").notNull(),
    secretId: text("secret_id").notNull(),
    secretVersionId: text("secret_version_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.orgId, table.approvalRequestId, table.secretVersionId],
    }),
    foreignKey({
      columns: [table.orgId, table.approvalRequestId],
      foreignColumns: [approvalRequests.orgId, approvalRequests.id],
    }),
    foreignKey({
      columns: [table.orgId, table.secretId],
      foreignColumns: [secrets.orgId, secrets.id],
    }),
    foreignKey({
      columns: [table.orgId, table.secretId, table.secretVersionId],
      foreignColumns: [secretVersions.orgId, secretVersions.secretId, secretVersions.id],
    }),
  ],
);
