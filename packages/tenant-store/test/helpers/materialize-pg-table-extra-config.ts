import type { PgTable } from "drizzle-orm/pg-core";

type ExtraConfigTable = PgTable & Record<symbol, unknown>;

/** Invokes pgTable extra-config builders so constraint callbacks are evaluated under coverage. */
export function materializePgTableExtraConfig(table: PgTable): void {
  const extraConfigTable = table as ExtraConfigTable;
  const extraConfigBuilder = extraConfigTable[Symbol.for("drizzle:ExtraConfigBuilder")];
  if (typeof extraConfigBuilder === "function") {
    const extraConfigColumns = extraConfigTable[Symbol.for("drizzle:ExtraConfigColumns")];
    extraConfigBuilder(extraConfigColumns);
  }
}

export function materializePgTableExtraConfigs(tables: readonly PgTable[]): void {
  for (const table of tables) {
    materializePgTableExtraConfig(table);
  }
}
