import { pgTable, text, timestamp } from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";

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
