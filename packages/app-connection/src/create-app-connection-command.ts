import type { Keyring } from "@insecur/crypto";
import type { ActorRef, UserActorRef } from "@insecur/access";
import {
  APP_CONNECTION_ERROR_CODES,
  generateOpaqueResourceIdForPrefix,
  providerCredentialId,
  type AppConnectionId,
  type DisplayName,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import {
  TenantAppConnectionStore,
  TenantProviderAppRegistrationStore,
  TenantSensitiveMetadataStore,
  type AppConnectionMethod,
  type AppConnectionProvider,
  withTenantScope,
} from "@insecur/tenant-store";

import { beginAppConnectionChangeCommand } from "./app-connection-change-gate.js";
import { AppConnectionError } from "./app-connection-error.js";
import {
  createCloudflareScopedTokenConnection,
  type MetadataSafeCloudflareConnectionValidation,
} from "./create-cloudflare-scoped-token-connection.js";
import { createCloudflareScopedTokenPort } from "./cloudflare-scoped-token-port.js";
import {
  createGitHubAppConnection,
  type MetadataSafeGitHubConnectionValidation,
} from "./create-github-app-connection.js";
import { createGitHubAppInstallationPort } from "./github-app-port.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";

function requireCloudflareBoundary(input: CreateAppConnectionCommandInput): {
  readonly allowedAccountId: string;
  readonly allowedWorkerScript: string;
} {
  const boundary = input.cloudflareBoundary;
  if (boundary === undefined) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "Cloudflare connection create requires --allow-account-id and --allow-worker-script",
    );
  }
  return boundary;
}

function requireCloudflareToken(input: CreateAppConnectionCommandInput): Uint8Array {
  if (input.tokenPlaintext === undefined) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.credentialMissing,
      "Cloudflare scoped-token create requires a provider token via stdin or masked prompt",
    );
  }
  return input.tokenPlaintext;
}

function requireGitHubBoundary(input: CreateAppConnectionCommandInput): {
  readonly installationId: string;
  readonly owner: string;
  readonly allowedRepositories: readonly string[];
} {
  const boundary = input.githubBoundary;
  if (boundary === undefined) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "GitHub app connection create requires installation boundary fields",
    );
  }
  return boundary;
}

export interface CreateAppConnectionCommandInput {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly instanceId: string;
  readonly appConnectionId: AppConnectionId;
  readonly provider: AppConnectionProvider;
  readonly connectionMethod: AppConnectionMethod;
  readonly displayName: DisplayName;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly tokenPlaintext?: Uint8Array;
  readonly cloudflareBoundary?: {
    readonly allowedAccountId: string;
    readonly allowedWorkerScript: string;
  };
  readonly githubBoundary?: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositories: readonly string[];
  };
  readonly keyring: Keyring;
}

function assertCloudflareCreateInput(input: CreateAppConnectionCommandInput): void {
  if (input.connectionMethod !== "scoped-api-token") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
  }
}

function assertGitHubCreateInput(input: CreateAppConnectionCommandInput): void {
  if (input.connectionMethod !== "github-app") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
  }
}

function mintProviderCredentialId() {
  return providerCredentialId.brand(generateOpaqueResourceIdForPrefix("pcred"));
}

async function createCloudflareAppConnection(
  input: CreateAppConnectionCommandInput,
  actor: UserActorRef,
  gate: { operationId: OperationId; projectId: ProjectId },
) {
  assertCloudflareCreateInput(input);
  const boundary = requireCloudflareBoundary(input);
  const tokenPlaintext = requireCloudflareToken(input);

  const result = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      createCloudflareScopedTokenConnection({
        actor,
        organizationId: input.organizationId,
        projectId: gate.projectId,
        operationId: gate.operationId,
        appConnectionId: input.appConnectionId,
        credentialId: mintProviderCredentialId(),
        displayName: input.displayName,
        setupUserId: actor.userId,
        boundary,
        tokenPlaintext,
        keyring: input.keyring,
        cloudflarePort: createCloudflareScopedTokenPort(fetch),
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      }),
  );

  return {
    connection: toMetadataSafeAppConnectionStatus(result.connection),
    validation: result.validation,
    auditEventId: result.auditEventId,
  };
}

async function createGitHubAppConnectionFromCommand(
  input: CreateAppConnectionCommandInput,
  actor: UserActorRef,
  gate: { operationId: OperationId; projectId: ProjectId },
) {
  assertGitHubCreateInput(input);
  const boundary = requireGitHubBoundary(input);

  const result = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const providerAppRegistrationStore = new TenantProviderAppRegistrationStore(db);
      const registration = await providerAppRegistrationStore.getRegistration({
        instanceId: input.instanceId,
        provider: "github",
        connectionMethod: "github-app",
      });
      if (registration?.status !== "configured") {
        throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.providerRegistrationMissing);
      }

      return createGitHubAppConnection({
        actor,
        organizationId: input.organizationId,
        projectId: gate.projectId,
        instanceId: input.instanceId,
        operationId: gate.operationId,
        appConnectionId: input.appConnectionId,
        providerAppRegistrationId: registration.id,
        displayName: input.displayName,
        setupUserId: actor.userId,
        boundary,
        keyring: input.keyring,
        githubPort: createGitHubAppInstallationPort(),
        appConnectionStore: new TenantAppConnectionStore(db),
        providerAppRegistrationStore,
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    },
  );

  return {
    connection: toMetadataSafeAppConnectionStatus(result.connection),
    validation: result.validation,
    auditEventId: result.auditEventId,
  };
}

export async function createAppConnectionCommand(input: CreateAppConnectionCommandInput): Promise<{
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation:
    MetadataSafeCloudflareConnectionValidation | MetadataSafeGitHubConnectionValidation;
  readonly auditEventId: string;
}> {
  const { actor, gate } = await beginAppConnectionChangeCommand(input);

  if (input.provider === "cloudflare") {
    return createCloudflareAppConnection(input, actor, gate);
  }

  if (input.provider === "github") {
    return createGitHubAppConnectionFromCommand(input, actor, gate);
  }

  throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
}
