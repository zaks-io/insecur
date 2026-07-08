import { text } from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";

/** Shared org-qualified named resource columns (id, orgId, displayName, status). */
export function orgScopedNamedResourceBaseColumns() {
  return {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
  };
}
