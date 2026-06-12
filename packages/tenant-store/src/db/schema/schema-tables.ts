import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Loads every `public` schema user table for conformance checks under active coverage.
 * Dynamic imports keep pgTable constraint builders off the static module graph so their
 * function coverage is attributed during unit tests.
 */
export async function loadUserSchemaTables(): Promise<readonly PgTable[]> {
  const [
    tenantHierarchy,
    instanceBootstrap,
    tenantCollaboration,
    tenantIntegrations,
    tenantSecrets,
  ] = await Promise.all([
    import("./tenant-hierarchy.js"),
    import("./instance-bootstrap.js"),
    import("./tenant-collaboration.js"),
    import("./tenant-integrations.js"),
    import("./tenant-secrets.js"),
  ]);

  return [
    tenantHierarchy.instances,
    tenantHierarchy.organizations,
    tenantHierarchy.projects,
    tenantHierarchy.environments,
    tenantHierarchy.teams,
    tenantHierarchy.memberships,
    tenantHierarchy.organizationDataKeys,
    tenantHierarchy.projectDataKeys,
    instanceBootstrap.instanceConfigurations,
    instanceBootstrap.instanceIdentityConfigurations,
    instanceBootstrap.bootstrapOperatorClaims,
    instanceBootstrap.instanceOperators,
    instanceBootstrap.bootstrapSecretVerifiers,
    tenantCollaboration.invitations,
    tenantCollaboration.syncTargetLeases,
    tenantCollaboration.machineIdentities,
    tenantCollaboration.machineIdentityMemberships,
    tenantIntegrations.appConnections,
    tenantIntegrations.providerCredentials,
    tenantIntegrations.sensitiveMetadataFields,
    tenantSecrets.secrets,
    tenantSecrets.secretVersions,
    tenantSecrets.injectionGrants,
    tenantSecrets.auditEvents,
    tenantSecrets.operations,
  ];
}
