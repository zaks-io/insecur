import type { SQL } from "drizzle-orm";
import { getTableName, is, SQL as SQLClass } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";

import { formatConformanceReport, throwIfConformanceViolations } from "./conformance-report.js";

const pgDialect = new PgDialect();
const SCHEMA_SHAPE_CONFORMANCE_TITLE = "Schema shape conformance failed:";

export interface SchemaShapeColumn {
  readonly notNull: boolean;
  readonly primaryKey: boolean;
  readonly hasDefault: boolean;
  readonly columnType: string;
  readonly sqlType: string;
  readonly withTimezone?: boolean;
  readonly defaultSql?: string;
}

export interface SchemaShapeCheck {
  readonly name: string;
  readonly sql: string;
}

export interface SchemaShapeUniqueConstraint {
  readonly name: string;
  readonly columns: readonly string[];
  readonly nullsNotDistinct: boolean;
}

export interface SchemaShapeIndex {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
  readonly nullsNotDistinct: boolean;
  readonly whereSql?: string;
}

export interface SchemaShapeForeignKey {
  readonly name: string;
  readonly columns: readonly string[];
  readonly foreignTable: string;
  readonly foreignColumns: readonly string[];
}

export interface SchemaShapePrimaryKey {
  readonly name?: string;
  readonly columns: readonly string[];
}

export interface SchemaShapeTable {
  readonly columns: Readonly<Record<string, SchemaShapeColumn>>;
  readonly checks: readonly SchemaShapeCheck[];
  readonly uniqueConstraints: readonly SchemaShapeUniqueConstraint[];
  readonly indexes: readonly SchemaShapeIndex[];
  readonly foreignKeys: readonly SchemaShapeForeignKey[];
  readonly primaryKeys: readonly SchemaShapePrimaryKey[];
}

export type SchemaShapeRegistry = Readonly<Record<string, SchemaShapeTable>>;

export class SchemaShapeConformanceError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(formatSchemaShapeViolations(violations));
    this.name = "SchemaShapeConformanceError";
    this.violations = violations;
  }
}

export function formatSchemaShapeViolations(violations: readonly string[]): string {
  return formatConformanceReport(SCHEMA_SHAPE_CONFORMANCE_TITLE, violations);
}

function serializeSql(fragment: SQL | undefined): string | undefined {
  if (fragment === undefined) {
    return undefined;
  }
  return pgDialect.sqlToQuery(fragment).sql;
}

function indexColumnName(column: unknown): string {
  if (
    typeof column === "object" &&
    column !== null &&
    "name" in column &&
    typeof column.name === "string"
  ) {
    return column.name;
  }
  return serializeSql(column as SQL) ?? "<expression>";
}

function extractSchemaShapeColumn(column: PgColumn): SchemaShapeColumn {
  const shape: SchemaShapeColumn = {
    notNull: column.notNull,
    primaryKey: column.primary,
    hasDefault: column.hasDefault,
    columnType: column.columnType,
    sqlType: column.getSQLType(),
  };

  const withTimezone = (column as PgColumn & { withTimezone?: boolean }).withTimezone;
  const withTimezoneShape = withTimezone === undefined ? shape : { ...shape, withTimezone };

  if (column.default !== undefined && is(column.default, SQLClass)) {
    const defaultSql = serializeSql(column.default);
    if (defaultSql !== undefined) {
      return { ...withTimezoneShape, defaultSql };
    }
  }

  return withTimezoneShape;
}

function buildSchemaShapeColumns(columns: readonly PgColumn[]): Record<string, SchemaShapeColumn> {
  const shapeColumns: Record<string, SchemaShapeColumn> = {};
  for (const column of columns) {
    shapeColumns[column.name] = extractSchemaShapeColumn(column);
  }
  return shapeColumns;
}

function buildSchemaShapeChecks(
  checks: ReturnType<typeof getTableConfig>["checks"],
): readonly SchemaShapeCheck[] {
  return sortByName(
    checks.map((check) => ({
      name: check.name,
      sql: serializeSql(check.value) ?? "",
    })),
  );
}

function buildSchemaShapeUniqueConstraints(
  uniqueConstraints: ReturnType<typeof getTableConfig>["uniqueConstraints"],
): readonly SchemaShapeUniqueConstraint[] {
  return sortByName(
    uniqueConstraints.map((constraint) => ({
      name: constraint.getName() ?? "<unnamed>",
      columns: constraint.columns.map((column) => column.name),
      nullsNotDistinct: constraint.nullsNotDistinct,
    })),
  );
}

function buildSchemaShapeIndexes(
  indexes: ReturnType<typeof getTableConfig>["indexes"],
): readonly SchemaShapeIndex[] {
  return sortByName(
    indexes.map((index) => {
      const indexConfig = index.config as typeof index.config & { nullsNotDistinct?: boolean };
      const shape: SchemaShapeIndex = {
        name: index.config.name ?? "<unnamed>",
        columns: index.config.columns.map((column) => indexColumnName(column)),
        unique: index.config.unique,
        nullsNotDistinct: indexConfig.nullsNotDistinct ?? false,
      };
      if (index.config.where === undefined) {
        return shape;
      }
      const whereSql = serializeSql(index.config.where);
      return whereSql === undefined ? shape : { ...shape, whereSql };
    }),
  );
}

function buildSchemaShapeForeignKeys(
  foreignKeys: ReturnType<typeof getTableConfig>["foreignKeys"],
): readonly SchemaShapeForeignKey[] {
  return sortByName(
    foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        name: foreignKey.getName(),
        columns: reference.columns.map((column) => column.name),
        foreignTable: getTableName(reference.foreignTable),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
      };
    }),
  );
}

function buildSchemaShapePrimaryKeys(
  primaryKeys: ReturnType<typeof getTableConfig>["primaryKeys"],
): readonly SchemaShapePrimaryKey[] {
  return primaryKeys.map((primaryKey) => ({
    columns: primaryKey.columns.map((column) => column.name),
    name: primaryKey.getName(),
  }));
}

export function extractSchemaShapeTable(table: PgTable): SchemaShapeTable {
  const config = getTableConfig(table);

  return {
    columns: buildSchemaShapeColumns(config.columns),
    checks: buildSchemaShapeChecks(config.checks),
    uniqueConstraints: buildSchemaShapeUniqueConstraints(config.uniqueConstraints),
    indexes: buildSchemaShapeIndexes(config.indexes),
    foreignKeys: buildSchemaShapeForeignKeys(config.foreignKeys),
    primaryKeys: buildSchemaShapePrimaryKeys(config.primaryKeys),
  };
}

function sortByName<T extends { name: string }>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export function extractSchemaShapeRegistry(tables: readonly PgTable[]): SchemaShapeRegistry {
  const registry: Record<string, SchemaShapeTable> = {};

  for (const table of tables) {
    registry[getTableName(table)] = extractSchemaShapeTable(table);
  }

  return registry;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }
    return current as unknown;
  });
}

function collectTableShapeViolations(
  tableName: string,
  actual: SchemaShapeTable,
  expected: SchemaShapeTable,
): string[] {
  if (stableStringify(actual) === stableStringify(expected)) {
    return [];
  }

  return [
    `${tableName}: actual shape differs from expected registry (${stableStringify(actual)} vs ${stableStringify(expected)})`,
  ];
}

export function collectSchemaShapeConformanceViolations(
  actual: SchemaShapeRegistry,
  expected: SchemaShapeRegistry,
): string[] {
  const violations: string[] = [];

  for (const tableName of Object.keys(actual).sort()) {
    const actualTable = actual[tableName];
    const expectedTable = expected[tableName];
    if (expectedTable === undefined) {
      violations.push(`table ${tableName} is missing from the schema shape registry`);
      continue;
    }
    if (actualTable === undefined) {
      continue;
    }

    violations.push(...collectTableShapeViolations(tableName, actualTable, expectedTable));
  }

  for (const tableName of Object.keys(expected).sort()) {
    if (actual[tableName] === undefined) {
      violations.push(
        `registry table ${tableName} has no matching schema table in the checked surface`,
      );
    }
  }

  return violations;
}

export function assertSchemaShapeConformance(
  actual: SchemaShapeRegistry,
  expected: SchemaShapeRegistry,
): void {
  const violations = collectSchemaShapeConformanceViolations(actual, expected);
  throwIfConformanceViolations(
    violations,
    (conformanceViolations) => new SchemaShapeConformanceError(conformanceViolations),
  );
}

export function assertDrizzleSchemaShapeConformance(
  tables: readonly PgTable[],
  expected: SchemaShapeRegistry,
): void {
  assertSchemaShapeConformance(extractSchemaShapeRegistry(tables), expected);
}
