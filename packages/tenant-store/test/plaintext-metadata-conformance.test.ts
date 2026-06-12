import { describe, expect, it } from "vitest";

import { PLAINTEXT_METADATA_ALLOWLIST } from "../src/db/schema/plaintext-metadata-allowlist.js";
import {
  assertDrizzleSchemaPlaintextMetadataConformance,
  assertPlaintextMetadataConformance,
  collectPlaintextMetadataConformanceViolations,
  enumerateDrizzleSchemaColumns,
  PlaintextMetadataConformanceError,
} from "../src/db/schema/plaintext-metadata-conformance.js";
import { USER_SCHEMA_TABLES } from "../src/db/schema/schema-tables.js";

describe("plaintext metadata allowlist (unit layer)", () => {
  it("conforms to the exported Drizzle schema with zero drift in either direction", () => {
    expect(() => assertDrizzleSchemaPlaintextMetadataConformance()).not.toThrow();
  });

  it("covers every user table in the schema surface", () => {
    const schemaTables = [...enumerateDrizzleSchemaColumns(USER_SCHEMA_TABLES).keys()].sort();
    const registryTables = Object.keys(PLAINTEXT_METADATA_ALLOWLIST).sort();
    expect(schemaTables).toEqual(registryTables);
    expect(schemaTables).toHaveLength(25);
  });

  it("fails closed on an unregistered schema column", () => {
    const actualColumns = enumerateDrizzleSchemaColumns(USER_SCHEMA_TABLES);
    const driftedColumns = new Map(actualColumns);
    const secretsColumns = new Set(driftedColumns.get("secrets"));
    secretsColumns?.add("unregistered_column");
    driftedColumns.set("secrets", secretsColumns ?? new Set());

    expect(() => assertPlaintextMetadataConformance(driftedColumns)).toThrow(
      PlaintextMetadataConformanceError,
    );
    expect(collectPlaintextMetadataConformanceViolations(driftedColumns)).toContainEqual(
      "column secrets.unregistered_column is not registered in the Plaintext Metadata Allowlist",
    );
  });

  it("fails closed on an orphaned registry entry", () => {
    const actualColumns = enumerateDrizzleSchemaColumns(USER_SCHEMA_TABLES);
    const driftedRegistry = {
      ...PLAINTEXT_METADATA_ALLOWLIST,
      orphaned_table: {
        orphaned_column: { category: "opaque-id" as const },
      },
    };

    expect(() => assertPlaintextMetadataConformance(actualColumns, driftedRegistry)).toThrow(
      PlaintextMetadataConformanceError,
    );
    expect(
      collectPlaintextMetadataConformanceViolations(actualColumns, driftedRegistry),
    ).toContainEqual(
      "registry table orphaned_table has no matching schema table in the checked surface",
    );
  });
});
