import { describe, expect, it, vi } from "vitest";

const instrumentPostgresJsSqlMock = vi.hoisted(() => vi.fn((sql) => sql));

vi.mock("@sentry/cloudflare", () => ({
  instrumentPostgresJsSql: instrumentPostgresJsSqlMock,
}));

import { instrumentRuntimeSql } from "./sentry-postgres.js";

describe("instrumentRuntimeSql", () => {
  it("adds query spans only beneath an existing transaction", () => {
    const sql = vi.fn();

    expect(instrumentRuntimeSql(sql)).toBe(sql);
    expect(instrumentPostgresJsSqlMock).toHaveBeenCalledWith(sql, { requireParentSpan: true });
  });
});
