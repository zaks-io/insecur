import { describe, expect, it, vi } from "vitest";

import { bindJsonb } from "../src/bind-jsonb.js";
import type { TenantScopedSql } from "../src/tenant-scoped-sql.js";

describe("bindJsonb", () => {
  it("throws when value is undefined", () => {
    const sql = { typed: vi.fn() } as unknown as TenantScopedSql;

    expect(() => bindJsonb(sql, undefined)).toThrow("bindJsonb: value must not be undefined");
    expect(sql.typed).not.toHaveBeenCalled();
  });

  it("binds JSON-serialized values with the jsonb OID", () => {
    const typed = vi.fn().mockReturnValue("bound");
    const sql = { typed } as unknown as TenantScopedSql;
    const value = { gate: "storage_security" };

    expect(bindJsonb(sql, value)).toBe("bound");
    expect(typed).toHaveBeenCalledWith(JSON.stringify(value), 3802);
  });
});
