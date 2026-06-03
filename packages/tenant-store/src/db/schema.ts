/**
 * Drizzle schema source of truth (ADR-0037). Product table definitions land in ARCH-2 S2
 * (INS-157); this slice only wires the generate/apply pipeline.
 */
import { pgSchema } from "drizzle-orm/pg-core";

/** Matches `CREATE SCHEMA app` in legacy migrations; policies stay in raw SQL (ADR-0037). */
export const app = pgSchema("app");
