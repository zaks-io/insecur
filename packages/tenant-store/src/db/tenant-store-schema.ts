/**
 * Tables used by tenant-store query layer (Drizzle client schema bundle).
 */
import { environments, organizationDataKeys, projectDataKeys } from "./schema/tenant-hierarchy.js";
import { providerCredentials, sensitiveMetadataFields } from "./schema/tenant-integrations.js";
import { injectionGrants, secretVersions, secrets } from "./schema/tenant-secrets.js";

export const tenantStoreSchema = {
  environments,
  organizationDataKeys,
  projectDataKeys,
  providerCredentials,
  sensitiveMetadataFields,
  injectionGrants,
  secretVersions,
  secrets,
};

export type TenantStoreSchema = typeof tenantStoreSchema;
