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

export interface ConnectionOperationScope {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

interface ConnectionAccessDeps<TMetadata> {
  readonly assertConnection: (connection: AppConnectionRow) => void;
  readonly loadMetadata: (input: ConnectionOperationScope) => Promise<TMetadata>;
}

async function runScopedConnectionOperation<T, TMetadata>(
  input: ConnectionOperationScope & {
    readonly run: (connection: AppConnectionRow, metadata: TMetadata) => Promise<T>;
  },
  deps: ConnectionAccessDeps<TMetadata>,
): Promise<T> {
  const connection = await input.appConnectionStore.getConnectionById(
    input.organizationId,
    input.appConnectionId,
  );
  if (!connection) {
    throw new AppConnectionError("connection.not_found");
  }

  deps.assertConnection(connection);
  const metadata = await deps.loadMetadata(input);
  return input.run(connection, metadata);
}

export async function withConnectionManageAccess<T, TMetadata>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (connection: AppConnectionRow, metadata: TMetadata) => Promise<T>;
  },
  deps: ConnectionAccessDeps<TMetadata>,
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

  return runScopedConnectionOperation(input, deps);
}

export async function withConnectionReadAccess<T, TMetadata>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (connection: AppConnectionRow, metadata: TMetadata) => Promise<T>;
  },
  deps: ConnectionAccessDeps<TMetadata>,
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

  return runScopedConnectionOperation(input, deps);
}
