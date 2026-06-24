import { pgTable, text } from "../../src/db/schema/pg-core.js";

/** Test-only pgTable export; must stay out of USER_SCHEMA_TABLE_MODULE_PATHS. */
export const conformanceGateFixtureTable = pgTable("conformance_gate_fixture_table", {
  id: text("id").primaryKey(),
});
