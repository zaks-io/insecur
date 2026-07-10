/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
/* Stryker disable ObjectLiteral */
import { boolean, check, integer, pgTable, sql, text, timestamp } from "./pg-core.js";

/**
 * Restore-import journal (ADR-0084). Instance-scope singleton row: the `only_row` primary key IS
 * the exclusion primitive — a second insert violates the unique constraint, so at most one import
 * can ever land in a restore target. Present-but-empty is part of the fresh-target proof, and the
 * table is deliberately excluded from backup exports so a restored target never inherits a stale
 * journal. No FK to `instances`: the marker is written before any instance rows are imported.
 */
export const restoreImportJournal = pgTable(
  "restore_import_journal",
  {
    onlyRow: boolean("only_row").primaryKey().default(true),
    instanceId: text("instance_id").notNull(),
    artifactRef: text("artifact_ref").notNull(),
    sourceExportOperationId: text("source_export_operation_id").notNull(),
    sourceExportTimestamp: timestamp("source_export_timestamp", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // organization_count is retained as the imported-organization count for compatibility with the
    // ADR-0084 evidence shape; manifest/skipped counts make a vanished-org restore self-evidencing.
    organizationCount: integer("organization_count"),
    manifestOrganizationCount: integer("manifest_organization_count"),
    skippedOrganizationCount: integer("skipped_organization_count"),
    importedRowCount: integer("imported_row_count"),
  },
  (table) => [
    check("restore_import_journal_only_row_check", sql`${table.onlyRow} = true`),
    check(
      "restore_import_journal_status_check",
      sql`${table.status} IN ('running', 'succeeded', 'failed')`,
    ),
  ],
);
