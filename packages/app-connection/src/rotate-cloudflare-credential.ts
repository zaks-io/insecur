import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  APP_CONNECTION_ERROR_CODES,
  generateOpaqueResourceIdForPrefix,
  providerCredentialId,
  type AppConnectionId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import {
  TenantAppConnectionStore,
  TenantProviderCredentialStore,
  TenantSensitiveMetadataStore,
  withTenantScope,
} from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";
import { attachProviderCredential } from "./attach-provider-credential.js";
import { createCloudflareScopedTokenPort } from "./cloudflare-scoped-token-port.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";
import { toMetadataSafeCloudflareConnectionStatus } from "./metadata-safe-cloudflare-connection-status.js";
import { validateCloudflareScopedTokenConnection } from "./validate-cloudflare-scoped-token-connection.js";
import type { MetadataSafeCloudflareConnectionValidation } from "./create-cloudflare-scoped-token-connection.js";
import { orgScopedConnectionProjectId } from "./org-scoped-connection-project-id.js";

async function loadCloudflareConnectionRow(
  organizationId: OrganizationId,
  appConnectionId: AppConnectionId,
) {
  return withTenantScope({ kind: "organization", organizationId }, async ({ db }) => {
    const appConnectionStore = new TenantAppConnectionStore(db);
    const connection = await appConnectionStore.getConnectionById(organizationId, appConnectionId);
    if (!connection) {
      throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
    }
    if (
      connection.provider !== "cloudflare" ||
      connection.connectionMethod !== "scoped-api-token"
    ) {
      throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
    }
    return { connection, appConnectionStore, db };
  });
}

export async function dryRunCloudflareCredentialRotation(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
}): Promise<{
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeCloudflareConnectionValidation;
}> {
  const loaded = await loadCloudflareConnectionRow(input.organizationId, input.appConnectionId);
  const validation = await validateCloudflareScopedTokenConnection({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: orgScopedConnectionProjectId(),
    appConnectionId: input.appConnectionId,
    keyring: input.keyring,
    cloudflarePort: createCloudflareScopedTokenPort(fetch),
    appConnectionStore: loaded.appConnectionStore,
    providerCredentialStore: new TenantProviderCredentialStore(loaded.db),
    sensitiveMetadataStore: new TenantSensitiveMetadataStore(loaded.db),
  });

  return {
    connection: toMetadataSafeAppConnectionStatus(loaded.connection),
    validation,
  };
}

async function attachRotatedCloudflareCredential(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly operationId: OperationId;
  readonly projectId: ProjectId;
  readonly tokenPlaintext: Uint8Array;
  readonly keyring: Keyring;
}) {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const appConnectionStore = new TenantAppConnectionStore(db);
      const existing = await appConnectionStore.getConnectionById(
        input.organizationId,
        input.appConnectionId,
      );
      if (!existing) {
        throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
      }
      if (existing.provider !== "cloudflare" || existing.connectionMethod !== "scoped-api-token") {
        throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
      }

      return attachProviderCredential({
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        operationId: input.operationId,
        appConnectionId: input.appConnectionId,
        credentialId: providerCredentialId.brand(generateOpaqueResourceIdForPrefix("pcred")),
        tokenPlaintext: input.tokenPlaintext,
        keyring: input.keyring,
        cloudflarePort: createCloudflareScopedTokenPort(fetch),
        appConnectionStore,
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    },
  );
}

export async function rotateCloudflareScopedTokenCredential(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly operationId: OperationId;
  readonly projectId: ProjectId;
  readonly tokenPlaintext: Uint8Array;
  readonly keyring: Keyring;
}): Promise<{
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeCloudflareConnectionValidation;
  readonly auditEventId: string;
}> {
  const attached = await attachRotatedCloudflareCredential(input);

  const projected = toMetadataSafeCloudflareConnectionStatus(attached.connection);
  if (projected.validation === null) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.validationFailed);
  }
  return {
    connection: projected.connection,
    validation: projected.validation,
    auditEventId: attached.auditEventId,
  };
}
