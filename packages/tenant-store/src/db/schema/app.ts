import { pgSchema } from "drizzle-orm/pg-core";

/** Empty app schema marker so drizzle-kit does not emit DROP SCHEMA on migrate. */
export const app = pgSchema("app");
