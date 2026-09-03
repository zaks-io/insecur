import { describe, expect, it } from "vitest";

import {
  assertSweepReadRows,
  buildTableSweepQuery,
  collectTableHits,
} from "../src/plaintext-sweep";
import { mintSmokeSentinel } from "../src/redaction";

const VARIANTS = [
  { encoding: "raw", pattern: "SENTINEL" },
  { encoding: "hex", pattern: "53454e54494e454c" },
];

describe("buildTableSweepQuery", () => {
  it("probes every column against every encoding in a single aggregate query", () => {
    const query = buildTableSweepQuery(
      "secrets",
      [{ columnName: "name" }, { columnName: "payload" }],
      VARIANTS,
    );

    expect(query.text.match(/bool_or/gu)).toHaveLength(4);
    expect(query.text.startsWith("SELECT COUNT(*) AS sweep_row_count, ")).toBe(true);
    expect(query.text.endsWith(' FROM "secrets"')).toBe(true);
    expect(query.parameters).toEqual([
      "%SENTINEL%",
      "%53454e54494e454c%",
      "%SENTINEL%",
      "%53454e54494e454c%",
    ]);
    expect(query.probes).toEqual([
      { alias: "h0", columnName: "name", encoding: "raw" },
      { alias: "h1", columnName: "name", encoding: "hex" },
      { alias: "h2", columnName: "payload", encoding: "raw" },
      { alias: "h3", columnName: "payload", encoding: "hex" },
    ]);
  });

  it("binds each probe to its own positional parameter and alias", () => {
    const query = buildTableSweepQuery("secrets", [{ columnName: "name" }], VARIANTS);

    expect(query.text).toContain(`"name"::text LIKE $1 ESCAPE '\\'), false) AS h0`);
    expect(query.text).toContain(`"name"::text LIKE $2 ESCAPE '\\'), false) AS h1`);
  });

  it("coalesces to false so an empty table does not aggregate to NULL", () => {
    const query = buildTableSweepQuery("secrets", [{ columnName: "name" }], VARIANTS);

    for (const probe of query.probes) {
      expect(query.text).toContain(`, false) AS ${probe.alias}`);
    }
  });

  it("escapes LIKE metacharacters in the sentinel pattern", () => {
    const query = buildTableSweepQuery(
      "secrets",
      [{ columnName: "name" }],
      [{ encoding: "raw", pattern: "50%_off\\now" }],
    );

    expect(query.parameters).toEqual(["%50\\%\\_off\\\\now%"]);
  });

  it("quotes identifiers so a reserved or quoted name cannot break out of the query", () => {
    const query = buildTableSweepQuery(
      'we"ird',
      [{ columnName: 'col"umn' }],
      [{ encoding: "raw", pattern: "SENTINEL" }],
    );

    expect(query.text).toBe(
      `SELECT COUNT(*) AS sweep_row_count, COALESCE(bool_or("col""umn"::text LIKE $1 ESCAPE '\\'), false) AS h0 FROM "we""ird"`,
    );
  });

  it("covers every encoding the smoke sentinel mints", () => {
    const sentinel = mintSmokeSentinel();
    const query = buildTableSweepQuery("secrets", [{ columnName: "name" }], sentinel.variants);

    expect(query.probes.map((probe) => probe.encoding)).toEqual(
      sentinel.variants.map((variant) => variant.encoding),
    );
  });
});

describe("collectTableHits", () => {
  const query = buildTableSweepQuery(
    "secrets",
    [{ columnName: "name" }, { columnName: "payload" }],
    VARIANTS,
  );

  it("fails the negative control: attributes each true probe to its column and encoding", () => {
    const hits = collectTableHits("secrets", query.probes, {
      sweep_row_count: "4",
      h0: false,
      h1: false,
      h2: false,
      h3: true,
    });

    expect(hits).toEqual([{ columnName: "payload", encoding: "hex", tableName: "secrets" }]);
  });

  it("reports no hits when every probe came back false", () => {
    const hits = collectTableHits("secrets", query.probes, {
      sweep_row_count: "4",
      h0: false,
      h1: false,
      h2: false,
      h3: false,
    });

    expect(hits).toEqual([]);
  });

  it("throws rather than treat a non-boolean probe result as a clean column", () => {
    expect(() =>
      collectTableHits("secrets", query.probes, {
        sweep_row_count: "4",
        h0: "t",
        h1: false,
        h2: false,
        h3: false,
      }),
    ).toThrow(/probe h0 on secrets\.name returned string, not a boolean/u);
  });

  it("throws when a probe alias is missing from the aggregate row", () => {
    expect(() => collectTableHits("secrets", query.probes, { sweep_row_count: "4" })).toThrow(
      /probe h0 on secrets\.name returned undefined, not a boolean/u,
    );
  });
});

describe("assertSweepReadRows", () => {
  const seededInstanceTable = { protectedByRls: false, rowCount: 4, tableName: "instances" };

  it("accepts a sweep that read rows from a forced-RLS table", () => {
    expect(() => {
      assertSweepReadRows([
        seededInstanceTable,
        { protectedByRls: true, rowCount: 2, tableName: "secrets" },
      ]);
    }).not.toThrow();
  });

  it("rejects a sweep that read every row from tables RLS never guarded", () => {
    // The exact silent false pass this guard exists for: the preview seed writes the instance-level
    // tables just before the run, so a total row count stays positive while a lost Service Access
    // scope hides every tenant row.
    expect(() => {
      assertSweepReadRows([
        seededInstanceTable,
        { protectedByRls: true, rowCount: 0, tableName: "secrets" },
        { protectedByRls: true, rowCount: 0, tableName: "organizations" },
      ]);
    }).toThrow(
      /read zero rows from all 2 forced-RLS table\(s\), so Service Access did not take effect/u,
    );
  });

  it("rejects a sweep that observed no rows at all", () => {
    expect(() => {
      assertSweepReadRows([{ protectedByRls: true, rowCount: 0, tableName: "secrets" }]);
    }).toThrow(/observed zero rows, so the sweep proved nothing/u);
  });

  it("rejects a schema with no forced-RLS tables to prove the scope against", () => {
    expect(() => {
      assertSweepReadRows([seededInstanceTable]);
    }).toThrow(/found no forced-RLS tables/u);
  });
});
