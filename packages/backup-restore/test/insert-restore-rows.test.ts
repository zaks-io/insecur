import { describe, expect, it, vi } from "vitest";

import type { TenantScopedSql } from "@insecur/tenant-store";

import { insertRestoreRows } from "../src/insert-restore-rows.js";
import type { RestoreTargetColumnTypes } from "../src/restore-target.js";

function fakeSql() {
  const unsafe = vi.fn().mockResolvedValue([]);
  return { sql: { unsafe } as unknown as TenantScopedSql, unsafe };
}

function columnTypes(columns: Record<string, string>): RestoreTargetColumnTypes {
  return new Map([["audit_events", new Map(Object.entries(columns))]]);
}

describe("insertRestoreRows json binding", () => {
  it("round-trips a stored JSON null in jsonb columns instead of collapsing it to SQL NULL", async () => {
    const { sql, unsafe } = fakeSql();

    await insertRestoreRows(
      sql,
      "audit_events",
      [{ table: "audit_events", id: "evt_1", details: null }],
      columnTypes({ id: "text", details: "jsonb" }),
    );

    expect(unsafe).toHaveBeenCalledTimes(1);
    expect(unsafe).toHaveBeenCalledWith(
      'INSERT INTO "audit_events" ("id", "details") VALUES ($1, $2)',
      ["evt_1", "null"],
    );
  });

  it("re-serializes json object and string values, and leaves non-json nulls as SQL NULL", async () => {
    const { sql, unsafe } = fakeSql();

    await insertRestoreRows(
      sql,
      "audit_events",
      [{ table: "audit_events", id: null, details: { reason: "ok" }, label: "plain" }],
      columnTypes({ id: "text", details: "jsonb", label: "json" }),
    );

    expect(unsafe).toHaveBeenCalledWith(
      'INSERT INTO "audit_events" ("id", "details", "label") VALUES ($1, $2, $3)',
      [null, '{"reason":"ok"}', '"plain"'],
    );
  });
});
