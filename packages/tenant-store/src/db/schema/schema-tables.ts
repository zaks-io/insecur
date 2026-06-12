/**
 * Canonical list of user-facing Drizzle tables for conformance checks.
 * The empty `app` pgSchema marker is excluded; drizzle bookkeeping lives in `drizzle`.
 */
import {
  appConnections,
  providerCredentials,
  sensitiveMetadataFields,
} from "./tenant-integrations.js";
import {
  auditEvents,
  injectionGrants,
  operations,
  secretVersions,
  secrets,
} from "./tenant-secrets.js";
import {
  environments,
  instances,
  memberships,
  organizationDataKeys,
  organizations,
  projectDataKeys,
  projects,
  teams,
} from "./tenant-hierarchy.js";
import {
  invitations,
  machineIdentities,
  machineIdentityMemberships,
  syncTargetLeases,
} from "./tenant-collaboration.js";
import {
  bootstrapOperatorClaims,
  bootstrapSecretVerifiers,
  instanceConfigurations,
  instanceIdentityConfigurations,
  instanceOperators,
} from "./instance-bootstrap.js";
import type { PgTable } from "drizzle-orm/pg-core";

/** Every `public` schema user table registered for Plaintext Metadata Allowlist conformance. */
export const USER_SCHEMA_TABLES = [
  instances,
  organizations,
  projects,
  environments,
  teams,
  memberships,
  organizationDataKeys,
  projectDataKeys,
  instanceConfigurations,
  instanceIdentityConfigurations,
  bootstrapOperatorClaims,
  instanceOperators,
  bootstrapSecretVerifiers,
  invitations,
  syncTargetLeases,
  machineIdentities,
  machineIdentityMemberships,
  appConnections,
  providerCredentials,
  sensitiveMetadataFields,
  secrets,
  secretVersions,
  injectionGrants,
  auditEvents,
  operations,
] as const satisfies readonly PgTable[];
