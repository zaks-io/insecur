import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  PLAINTEXT_METADATA_ALLOWLIST,
  type PlaintextMetadataAllowlist,
} from "./plaintext-metadata-allowlist.js";
import { USER_SCHEMA_TABLES } from "./schema-tables.js";

export type SchemaColumnMap = ReadonlyMap<string, ReadonlySet<string>>;

export class PlaintextMetadataConformanceError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(formatPlaintextMetadataConformanceViolations(violations));
    this.name = "PlaintextMetadataConformanceError";
    this.violations = violations;
  }
}

export function formatPlaintextMetadataConformanceViolations(
  violations: readonly string[],
): string {
  return [
    "Plaintext Metadata Allowlist conformance failed:",
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n");
}

export function enumerateDrizzleSchemaColumns(tables: readonly PgTable[]): SchemaColumnMap {
  const columnsByTable = new Map<string, Set<string>>();

  for (const table of tables) {
    const tableName = getTableName(table);
    const columns = new Set(Object.values(getTableColumns(table)).map((column) => column.name));
    columnsByTable.set(tableName, columns);
  }

  return columnsByTable;
}

function collectUnregisteredColumnViolations(
  actualColumns: SchemaColumnMap,
  registry: PlaintextMetadataAllowlist,
): string[] {
  const violations: string[] = [];

  for (const [tableName, columns] of actualColumns) {
    const registryTable = registry[tableName];
    if (registryTable === undefined) {
      violations.push(`table ${tableName} is missing from the Plaintext Metadata Allowlist`);
      continue;
    }

    for (const columnName of columns) {
      if (registryTable[columnName] === undefined) {
        violations.push(
          `column ${tableName}.${columnName} is not registered in the Plaintext Metadata Allowlist`,
        );
      }
    }
  }

  return violations;
}

function collectOrphanedRegistryViolations(
  actualColumns: SchemaColumnMap,
  registry: PlaintextMetadataAllowlist,
): string[] {
  const violations: string[] = [];

  for (const tableName of Object.keys(registry)) {
    const columns = actualColumns.get(tableName);
    if (columns === undefined) {
      violations.push(
        `registry table ${tableName} has no matching schema table in the checked surface`,
      );
      continue;
    }

    for (const columnName of Object.keys(registry[tableName] ?? {})) {
      if (!columns.has(columnName)) {
        violations.push(`registry entry ${tableName}.${columnName} has no matching schema column`);
      }
    }
  }

  return violations;
}

export function collectPlaintextMetadataConformanceViolations(
  actualColumns: SchemaColumnMap,
  registry: PlaintextMetadataAllowlist = PLAINTEXT_METADATA_ALLOWLIST,
): string[] {
  return [
    ...collectUnregisteredColumnViolations(actualColumns, registry),
    ...collectOrphanedRegistryViolations(actualColumns, registry),
  ];
}

export function assertPlaintextMetadataConformance(
  actualColumns: SchemaColumnMap,
  registry: PlaintextMetadataAllowlist = PLAINTEXT_METADATA_ALLOWLIST,
): void {
  const violations = collectPlaintextMetadataConformanceViolations(actualColumns, registry);
  if (violations.length > 0) {
    throw new PlaintextMetadataConformanceError(violations);
  }
}

export function assertDrizzleSchemaPlaintextMetadataConformance(
  tables: readonly PgTable[] = USER_SCHEMA_TABLES,
  registry: PlaintextMetadataAllowlist = PLAINTEXT_METADATA_ALLOWLIST,
): void {
  assertPlaintextMetadataConformance(enumerateDrizzleSchemaColumns(tables), registry);
}

export interface InformationSchemaColumnRow {
  tableName: string;
  columnName: string;
}

export function enumerateInformationSchemaColumns(
  rows: readonly InformationSchemaColumnRow[],
): SchemaColumnMap {
  const columnsByTable = new Map<string, Set<string>>();

  for (const row of rows) {
    const columns = columnsByTable.get(row.tableName) ?? new Set<string>();
    columns.add(row.columnName);
    columnsByTable.set(row.tableName, columns);
  }

  return columnsByTable;
}

export function assertInformationSchemaPlaintextMetadataConformance(
  rows: readonly InformationSchemaColumnRow[],
  registry: PlaintextMetadataAllowlist = PLAINTEXT_METADATA_ALLOWLIST,
): void {
  assertPlaintextMetadataConformance(enumerateInformationSchemaColumns(rows), registry);
}
