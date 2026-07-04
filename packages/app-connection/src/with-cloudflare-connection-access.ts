import { auditAccessDenialOnFailure } from "@insecur/access";
import type { UserActorRef } from "@insecur/access";
import type { AppConnectionId, OrganizationId, ProjectId } from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import {
  assertConnectionManageScope,
  assertConnectionReadScope,
  isConnectionAccessDenied,
} from "./assert-connection-access.js";
import { AppConnectionError } from "./app-connection-error.js";
import { assertCloudflareScopedTokenConnection } from "./create-cloudflare-scoped-token-connection.js";

interface ConnectionOperationScope {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly appConnectionStore: TenantAppConnectionStore;
}

export async function withConnectionManageAccess<T>(
  input: ConnectionOperationScope & {
    readonly recordDenied: () => Promise<void>;
    readonly run: (connection: AppConnectionRow) => Promise<T>;
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
    readonly run: (connection: AppConnectionRow) => Promise<T>;
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
    readonly run: (connection: AppConnectionRow) => Promise<T>;
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
  return input.run(connection);
}
