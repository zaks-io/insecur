import { beforeAll, describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { formatConformanceReport } from "../src/db/schema/conformance-report.js";
import { SCHEMA_SHAPE_REGISTRY } from "../src/db/schema/schema-shape-registry.js";
import {
  assertDrizzleSchemaShapeConformance,
  assertSchemaShapeConformance,
  collectSchemaShapeConformanceViolations,
  extractSchemaShapeRegistry,
  extractSchemaShapeTable,
  formatSchemaShapeViolations,
  SchemaShapeConformanceError,
} from "../src/db/schema/schema-shape.js";
import {
  collectPgTableExportsFromModule,
  USER_SCHEMA_TABLE_MODULE_PATHS,
} from "../src/db/schema/schema-tables.js";
import * as instanceBootstrapSchema from "../src/db/schema/instance-bootstrap.js";
import * as tenantCollaborationSchema from "../src/db/schema/tenant-collaboration.js";
import * as tenantMachineAuthMethodsSchema from "../src/db/schema/tenant-machine-auth-methods.js";
import * as tenantAgentSessionsSchema from "../src/db/schema/tenant-agent-sessions.js";
import * as tenantHierarchySchema from "../src/db/schema/tenant-hierarchy.js";
import * as tenantIntegrationsSchema from "../src/db/schema/tenant-integrations.js";
import * as tenantFeedbackSchema from "../src/db/schema/tenant-feedback.js";
import * as tenantSecretsSchema from "../src/db/schema/tenant-secrets.js";
import * as tenantSecretSyncsSchema from "../src/db/schema/tenant-secret-syncs.js";
import * as tenantProtectedChangesSchema from "../src/db/schema/tenant-protected-changes.js";
import * as tenantApprovalRequestsSchema from "../src/db/schema/tenant-approval-requests.js";
import * as tenantWebhooksSchema from "../src/db/schema/tenant-webhooks.js";
import * as restoreImportSchema from "../src/db/schema/restore-import.js";
import { environments } from "../src/db/schema/tenant-hierarchy.js";
import { secrets } from "../src/db/schema/tenant-secrets.js";
import { materializePgTableExtraConfigs } from "./helpers/materialize-pg-table-extra-config.js";

const USER_SCHEMA_MODULES = {
  "./tenant-hierarchy.js": tenantHierarchySchema,
  "./instance-bootstrap.js": instanceBootstrapSchema,
  "./tenant-collaboration.js": tenantCollaborationSchema,
  "./tenant-machine-auth-methods.js": tenantMachineAuthMethodsSchema,
  "./tenant-agent-sessions.js": tenantAgentSessionsSchema,
  "./tenant-integrations.js": tenantIntegrationsSchema,
  "./tenant-feedback.js": tenantFeedbackSchema,
  "./tenant-secrets.js": tenantSecretsSchema,
  "./tenant-secret-syncs.js": tenantSecretSyncsSchema,
  "./tenant-protected-changes.js": tenantProtectedChangesSchema,
  "./tenant-approval-requests.js": tenantApprovalRequestsSchema,
  "./tenant-webhooks.js": tenantWebhooksSchema,
  "./restore-import.js": restoreImportSchema,
} as const satisfies Record<
  (typeof USER_SCHEMA_TABLE_MODULE_PATHS)[number],
  Record<string, unknown>
>;

function collectPgIdentifierLengthViolations(
  registry: ReturnType<typeof extractSchemaShapeRegistry>,
): string[] {
  return Object.entries(registry).flatMap(([table, shape]) =>
    (["checks", "uniqueConstraints", "indexes", "foreignKeys", "primaryKeys"] as const).flatMap(
      (kind) =>
        (shape[kind] ?? [])
          .filter((item) => item.name.length > 63)
          .map((item) => `${table}.${kind}: ${item.name} (${item.name.length} chars)`),
    ),
  );
}

let userSchemaTables: readonly PgTable[];

describe("schema shape conformance (unit layer)", () => {
  beforeAll(() => {
    userSchemaTables = USER_SCHEMA_TABLE_MODULE_PATHS.flatMap((modulePath) =>
      collectPgTableExportsFromModule(USER_SCHEMA_MODULES[modulePath]),
    ).sort((left, right) => getTableName(left).localeCompare(getTableName(right)));
    materializePgTableExtraConfigs(userSchemaTables);
  });

  it("matches the checked-in schema shape registry with zero drift in either direction", () => {
    expect(() =>
      assertDrizzleSchemaShapeConformance(userSchemaTables, SCHEMA_SHAPE_REGISTRY),
    ).not.toThrow();
  });

  it("covers every user table in the schema surface", () => {
    const schemaTables = Object.keys(extractSchemaShapeRegistry(userSchemaTables)).sort();
    const registryTables = Object.keys(SCHEMA_SHAPE_REGISTRY).sort();
    expect(schemaTables).toEqual(registryTables);
  });

  it("keeps every constraint and index identifier within the Postgres 63-byte limit", () => {
    const violations = collectPgIdentifierLengthViolations(
      extractSchemaShapeRegistry(userSchemaTables),
    );

    expect(violations).toEqual([]);
  });

  it("materializes deferred secrets current-version foreign key constraints", () => {
    const secretsShape = extractSchemaShapeTable(secrets);
    expect(
      secretsShape.foreignKeys.some(
        (foreignKey) => foreignKey.name === "secrets_org_id_id_current_version_id_fkey",
      ),
    ).toBe(true);
  });

  it("preserves environment lifecycle check constraints", () => {
    const environmentShape = extractSchemaShapeTable(environments);
    expect(environmentShape.checks.map((check) => check.name).sort()).toEqual(
      [
        "environments_development_non_protected_check",
        "environments_lifecycle_stage_check",
        "environments_preview_opt_down_evidence_check",
        "environments_preview_opt_down_fields_scope_check",
        "environments_staging_production_protected_check",
      ].sort(),
    );
  });

  it("formats conformance violations for actionable error output", () => {
    const violations = ["table instances is missing from the schema shape registry"];

    expect(formatSchemaShapeViolations(violations)).toBe(
      formatConformanceReport("Schema shape conformance failed:", violations),
    );
    expect(formatSchemaShapeViolations(violations)).toBe(
      [
        "Schema shape conformance failed:",
        "- table instances is missing from the schema shape registry",
      ].join("\n"),
    );
  });

  it("fails closed when a check constraint is removed from the live schema", () => {
    const actual = extractSchemaShapeRegistry(userSchemaTables);
    const environmentsTable = actual.environments;
    if (environmentsTable === undefined) {
      throw new Error("expected environments table in schema shape");
    }

    const drifted = {
      ...actual,
      environments: {
        ...environmentsTable,
        checks: environmentsTable.checks.filter(
          (check) => check.name !== "environments_lifecycle_stage_check",
        ),
      },
    };

    expect(() => assertSchemaShapeConformance(drifted, SCHEMA_SHAPE_REGISTRY)).toThrow(
      SchemaShapeConformanceError,
    );
    expect(
      collectSchemaShapeConformanceViolations(drifted, SCHEMA_SHAPE_REGISTRY).length,
    ).toBeGreaterThan(0);
  });

  it("fails closed when a registry table has no matching schema table", () => {
    const actual = extractSchemaShapeRegistry(userSchemaTables);
    const driftedRegistry = {
      ...SCHEMA_SHAPE_REGISTRY,
      orphaned_table: {
        columns: { id: { notNull: true, primaryKey: true, hasDefault: false } },
        checks: [],
        uniqueConstraints: [],
        indexes: [],
        foreignKeys: [],
        primaryKeys: [{ columns: ["id"] }],
      },
    };

    expect(collectSchemaShapeConformanceViolations(actual, driftedRegistry)).toContainEqual(
      "registry table orphaned_table has no matching schema table in the checked surface",
    );
  });

  it("fails closed when a live schema table is missing from the registry", () => {
    const actual = extractSchemaShapeRegistry(userSchemaTables);
    const driftedRegistry = Object.fromEntries(
      Object.entries(SCHEMA_SHAPE_REGISTRY).filter(([tableName]) => tableName !== "instances"),
    );

    expect(collectSchemaShapeConformanceViolations(actual, driftedRegistry)).toContainEqual(
      "table instances is missing from the schema shape registry",
    );
  });

  it("fails closed when a column nullability contract drifts", () => {
    const actual = extractSchemaShapeRegistry(userSchemaTables);
    const secretsTable = actual.secrets;
    if (secretsTable === undefined) {
      throw new Error("expected secrets table in schema shape");
    }

    const driftedColumns = {
      ...secretsTable.columns,
      org_id: {
        ...secretsTable.columns.org_id,
        notNull: false,
      },
    };

    const drifted = {
      ...actual,
      secrets: {
        ...secretsTable,
        columns: driftedColumns,
      },
    };

    expect(() => assertSchemaShapeConformance(drifted, SCHEMA_SHAPE_REGISTRY)).toThrow(
      SchemaShapeConformanceError,
    );
  });
});
