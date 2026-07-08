import { isTable } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as instanceBootstrapSchema from "../src/db/schema/instance-bootstrap.js";
import * as tenantCollaborationSchema from "../src/db/schema/tenant-collaboration.js";
import * as tenantMachineAuthMethodsSchema from "../src/db/schema/tenant-machine-auth-methods.js";
import * as tenantHierarchySchema from "../src/db/schema/tenant-hierarchy.js";
import * as tenantIntegrationsSchema from "../src/db/schema/tenant-integrations.js";
import * as tenantSecretsSchema from "../src/db/schema/tenant-secrets.js";
import * as tenantWebhooksSchema from "../src/db/schema/tenant-webhooks.js";
import { collectPgTableExportsFromModule } from "../src/db/schema/schema-tables.js";
import { materializePgTableExtraConfigs } from "./helpers/materialize-pg-table-extra-config.js";

const SCHEMA_MODULES = {
  "tenant-hierarchy.js": tenantHierarchySchema,
  "instance-bootstrap.js": instanceBootstrapSchema,
  "tenant-collaboration.js": tenantCollaborationSchema,
  "tenant-machine-auth-methods.js": tenantMachineAuthMethodsSchema,
  "tenant-integrations.js": tenantIntegrationsSchema,
  "tenant-secrets.js": tenantSecretsSchema,
  "tenant-webhooks.js": tenantWebhooksSchema,
} as const;

const EXPECTED_TABLE_EXPORTS: Record<string, readonly string[]> = {
  "tenant-hierarchy.js": [
    "instances",
    "organizations",
    "projects",
    "environments",
    "teams",
    "memberships",
    "organizationDataKeys",
    "projectDataKeys",
  ],
  "instance-bootstrap.js": [
    "instanceConfigurations",
    "instanceIdentityConfigurations",
    "bootstrapOperatorClaims",
    "instanceOperators",
    "bootstrapSecretVerifiers",
    "userAdmissions",
    "providerAppRegistrations",
  ],
  "tenant-collaboration.js": ["invitations", "syncTargetLeases"],
  "tenant-machine-auth-methods.js": [
    "machineIdentities",
    "machineIdentityMemberships",
    "machineIdentityGitHubActionsOidc",
    "machineIdentityEnvironmentDeployKeys",
  ],
  "tenant-integrations.js": ["appConnections", "providerCredentials", "sensitiveMetadataFields"],
  "tenant-secrets.js": [
    "secrets",
    "secretVersions",
    "runtimeInjectionPolicies",
    "runtimeInjectionPolicyVersions",
    "injectionGrants",
    "auditEvents",
    "operations",
  ],
  "tenant-webhooks.js": [
    "webhookSubscriptions",
    "webhookSubscriptionEventTypes",
    "webhookSigningSecrets",
    "inAppEventNotifications",
  ],
};

describe("schema module exports (unit layer)", () => {
  beforeAll(() => {
    materializePgTableExtraConfigs(
      Object.values(SCHEMA_MODULES).flatMap((moduleExports) =>
        collectPgTableExportsFromModule(moduleExports as Record<string, unknown>),
      ),
    );
  });

  for (const [moduleFile, exportNames] of Object.entries(EXPECTED_TABLE_EXPORTS)) {
    it(`exports stable Drizzle table symbols from ${moduleFile}`, () => {
      const moduleExports = SCHEMA_MODULES[moduleFile as keyof typeof SCHEMA_MODULES];
      for (const exportName of exportNames) {
        expect(
          moduleExports[exportName],
          `${moduleFile} missing export ${exportName}`,
        ).toBeDefined();
        expect(isTable(moduleExports[exportName])).toBe(true);
      }
    });
  }
});
