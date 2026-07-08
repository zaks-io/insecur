/**
 * Drizzle schema source of truth (ADR-0037). Agent session persistence for Tier 2 attribution.
 */
import { pgTable, sql, text, timestamp, uniqueIndex } from "./pg-core.js";

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    humanSessionId: text("human_session_id").notNull(),
    harnessName: text("harness_name").notNull(),
    ancestryKey: text("ancestry_key").notNull(),
    tier: text("tier").notNull().default("registered"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_sessions_active_ancestry")
      .on(table.humanSessionId, table.ancestryKey)
      .where(sql`${table.closedAt} IS NULL`),
  ],
);
