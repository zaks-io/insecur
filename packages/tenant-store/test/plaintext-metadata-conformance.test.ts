import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isTable } from "drizzle-orm";
import { IndexBuilder } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";

import { PLAINTEXT_METADATA_ALLOWLIST } from "../src/db/schema/plaintext-metadata-allowlist.js";
import {
  assertDrizzleSchemaPlaintextMetadataConformance,
  assertInformationSchemaPlaintextMetadataConformance,
  assertPlaintextMetadataConformance,
  collectPlaintextMetadataConformanceViolations,
  enumerateDrizzleSchemaColumns,
  enumerateInformationSchemaColumns,
  formatPlaintextMetadataConformanceViolations,
  PlaintextMetadataConformanceError,
} from "../src/db/schema/plaintext-metadata-conformance.js";
import {
  collectPgTableExportsFromModule,
  loadUserSchemaTables,
  USER_SCHEMA_TABLE_MODULE_PATHS,
} from "../src/db/schema/schema-tables.js";
import { materializePgTableExtraConfigs } from "./helpers/materialize-pg-table-extra-config.js";

const SCHEMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/db/schema");

/** Schema modules that never export user `pgTable` definitions. */
const EXCLUDED_SCHEMA_FILES = new Set([
  "app.ts",
  "index.ts",
  "pg-core.ts",
  "plaintext-metadata-allowlist.ts",
  "plaintext-metadata-allowlist-instance-bootstrap.ts",
  "plaintext-metadata-conformance.ts",
  "schema-tables.ts",
]);

let userSchemaTables: readonly PgTable[];

describe("plaintext metadata allowlist (unit layer)", () => {
  beforeAll(async () => {
    userSchemaTables = await loadUserSchemaTables();
    materializePgTableExtraConfigs(userSchemaTables);
  });

  it("conforms to the exported Drizzle schema with zero drift in either direction", () => {
    expect(() => assertDrizzleSchemaPlaintextMetadataConformance(userSchemaTables)).not.toThrow();
  });

  it("covers every user table in the schema surface", () => {
    const schemaTables = [...enumerateDrizzleSchemaColumns(userSchemaTables).keys()].sort();
    const registryTables = Object.keys(PLAINTEXT_METADATA_ALLOWLIST).sort();
    expect(schemaTables).toEqual(registryTables);
  });

  it("includes every schema module that exports pgTable definitions", async () => {
    const schemaFiles = (await readdir(SCHEMA_DIR)).filter(
      (file) => file.endsWith(".ts") && !EXCLUDED_SCHEMA_FILES.has(file),
    );

    const modulesWithTables: string[] = [];
    for (const file of schemaFiles) {
      const modulePath = `../src/db/schema/${file.replace(/\.ts$/, ".js")}`;
      const moduleExports = await import(modulePath);
      if (Object.values(moduleExports).some((exported) => isTable(exported))) {
        modulesWithTables.push(`./${file.replace(/\.ts$/, ".js")}`);
      }
    }

    expect([...USER_SCHEMA_TABLE_MODULE_PATHS].sort()).toEqual(modulesWithTables.sort());
  });

  it("fails closed when a schema module exports a pgTable missing from the allowlist registry", async () => {
    const fixtureModule = await import("./fixtures/unregistered-schema-table.js");
    const fixtureTables = collectPgTableExportsFromModule(fixtureModule);
    materializePgTableExtraConfigs(fixtureTables);

    expect(() =>
      assertDrizzleSchemaPlaintextMetadataConformance([...userSchemaTables, ...fixtureTables]),
    ).toThrow(PlaintextMetadataConformanceError);
    expect(
      collectPlaintextMetadataConformanceViolations(
        enumerateDrizzleSchemaColumns([...userSchemaTables, ...fixtureTables]),
      ),
    ).toContainEqual(
      "table conformance_gate_fixture_table is missing from the Plaintext Metadata Allowlist",
    );
  });

  it("enumerates information_schema rows into the same table/column map shape", () => {
    const rows = [
      { tableName: "secrets", columnName: "id" },
      { tableName: "secrets", columnName: "org_id" },
      { tableName: "projects", columnName: "id" },
    ];

    expect(enumerateInformationSchemaColumns(rows).get("secrets")).toEqual(
      new Set(["id", "org_id"]),
    );
    expect(() => assertInformationSchemaPlaintextMetadataConformance(rows)).toThrow(
      PlaintextMetadataConformanceError,
    );
  });

  it("formats conformance violations for actionable error output", () => {
    expect(
      formatPlaintextMetadataConformanceViolations([
        "column secrets.unregistered_column is not registered in the Plaintext Metadata Allowlist",
      ]),
    ).toContain("secrets.unregistered_column");
  });

  it("fails closed on an unregistered schema column", () => {
    const actualColumns = enumerateDrizzleSchemaColumns(userSchemaTables);
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

  it("fails closed on a schema table missing from the registry", () => {
    const actualColumns = enumerateDrizzleSchemaColumns(userSchemaTables);
    const driftedColumns = new Map(actualColumns);
    driftedColumns.set("unregistered_table", new Set(["id"]));

    expect(collectPlaintextMetadataConformanceViolations(driftedColumns)).toContainEqual(
      "table unregistered_table is missing from the Plaintext Metadata Allowlist",
    );
  });

  it("fails closed on an orphaned registry entry", () => {
    const actualColumns = enumerateDrizzleSchemaColumns(userSchemaTables);
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

  it("fails closed on an orphaned registry column within an existing table", () => {
    const actualColumns = enumerateDrizzleSchemaColumns(userSchemaTables);
    const driftedRegistry = {
      ...PLAINTEXT_METADATA_ALLOWLIST,
      secrets: {
        ...PLAINTEXT_METADATA_ALLOWLIST.secrets,
        orphaned_column: { category: "opaque-id" as const },
      },
    };

    expect(
      collectPlaintextMetadataConformanceViolations(actualColumns, driftedRegistry),
    ).toContainEqual("registry entry secrets.orphaned_column has no matching schema column");
  });

  it("supports nullsNotDistinct on pg-core index builders", async () => {
    await import("../src/db/schema/pg-core.js");

    const builder = Object.create(IndexBuilder.prototype) as IndexBuilder & {
      config: { nullsNotDistinct?: boolean };
    };
    builder.config = {};

    expect(builder.nullsNotDistinct()).toBe(builder);
    expect(builder.config.nullsNotDistinct).toBe(true);
  });
});
