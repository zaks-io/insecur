import { describe, expect, it } from "vitest";

import { buildTableSweepQuery } from "../src/plaintext-sweep";
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
    expect(query.text.startsWith("SELECT ")).toBe(true);
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
      `SELECT COALESCE(bool_or("col""umn"::text LIKE $1 ESCAPE '\\'), false) AS h0 FROM "we""ird"`,
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
