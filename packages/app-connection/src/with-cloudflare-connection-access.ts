import { auditAccessDenialOnFailure } from "@insecur/access";
import type { UserActorRef } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import type { AppConnectionId, OrganizationId, ProjectId } from "@insecur/domain";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";

import {
  assertConnectionManageScope,
  assertConnectionReadScope,
  isConnectionAccessDenied,
} from "./assert-connection-access.js";
import { AppConnectionError } from "./app-connection-error.js";
import { assertCloudflareScopedTokenConnection } from "./assert-cloudflare-scoped-token-connection.js";
import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import { loadCloudflareConnectionBoundary } from "./load-cloudflare-connection-boundary.js";

interface ConnectionOperationScope {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export async function withConnectionManageAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (
      connection: AppConnectionRow,
      boundary: CloudflareConnectionBoundary,
    ) => Promise<T>;
  },
): Promise<T> {
  try {
    await assertConnectionManageScope(input.actor, input.organizationId, input.projectId);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isConnectionAccessDenied,
      recordDenied: input.recordDenied,
    });
    throw error;
  }

  return runScopedCloudflareConnectionOperation(input);
}

export async function withConnectionReadAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (
      connection: AppConnectionRow,
      boundary: CloudflareConnectionBoundary,
    ) => Promise<T>;
  },
): Promise<T> {
  try {
    await assertConnectionReadScope(input.actor, input.organizationId, input.projectId);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isConnectionAccessDenied,
      recordDenied: input.recordDenied,
    });
    throw error;
  }

  return runScopedCloudflareConnectionOperation(input);
}

async function runScopedCloudflareConnectionOperation<T>(
  input: ConnectionOperationScope & {
    readonly run: (
      connection: AppConnectionRow,
      boundary: CloudflareConnectionBoundary,
    ) => Promise<T>;
  },
): Promise<T> {
  const connection = await input.appConnectionStore.getConnectionById(
    input.organizationId,
    input.appConnectionId,
  );
  if (!connection) {
    throw new AppConnectionError("connection.not_found");
  }

  assertCloudflareScopedTokenConnection(connection);
  const boundary = await loadCloudflareConnectionBoundary({
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  });
  return input.run(connection, boundary);
}
