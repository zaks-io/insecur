import { assertCreateConnectionManageAccess } from "./assert-create-connection-manage-access.js";
import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type DisplayName,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type ProviderAppRegistrationId,
  type UserId,
} from "@insecur/domain";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantProviderAppRegistrationStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { AppConnectionError } from "./app-connection-error.js";
import { runWithAppConnectionChangeEvidence } from "./run-with-app-connection-change-evidence.js";
import type { GitHubConnectionBoundary } from "./github-app-metadata.js";
import type {
  GitHubAppInstallationPort,
  GitHubAppInstallationVerifyResult,
} from "./github-app-port.js";
import { persistGithubConnectionValidationSuccess } from "./persist-github-connection-validation-success.js";
import { recordConnectionCreated } from "./record-connection-audit.js";
import { toMetadataSafeGitHubValidation } from "./github-validation-projection.js";
import { storeGitHubConnectionBoundary } from "./store-github-connection-boundary.js";
import { verifyGitHubInstallation } from "./verify-github-installation.js";

export interface CreateGitHubAppConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly instanceId: string;
  readonly operationId: OperationId;
  readonly appConnectionId: AppConnectionId;
  readonly providerAppRegistrationId: ProviderAppRegistrationId;
  readonly displayName: DisplayName;
  readonly setupUserId: UserId;
  readonly boundary: GitHubConnectionBoundary;
  readonly keyring: Keyring;
  readonly githubPort: GitHubAppInstallationPort;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly providerAppRegistrationStore: TenantProviderAppRegistrationStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export interface MetadataSafeGitHubConnectionValidation {
  readonly checkedAt: string;
  readonly outcome: "success" | "failed";
  readonly reasonCode: string | null;
  readonly installationStatus: "active" | "suspended" | null;
  readonly accessibleRepositoryCount: number | null;
  readonly repositoriesWithinBoundary: boolean | null;
}

export interface MetadataSafeGitHubConnectionResult {
  readonly connection: AppConnectionRow;
  readonly validation: MetadataSafeGitHubConnectionValidation;
}

async function assertCreateConnectionAccess(input: CreateGitHubAppConnectionInput): Promise<void> {
  await assertCreateConnectionManageAccess(input);
}

async function assertProviderAppRegistrationConfigured(
  input: CreateGitHubAppConnectionInput,
): Promise<void> {
  const registration = await input.providerAppRegistrationStore.getRegistration({
    instanceId: input.instanceId,
    provider: "github",
    connectionMethod: "github-app",
  });
  if (registration?.status !== "configured") {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.providerRegistrationMissing);
  }
  if (registration.id !== input.providerAppRegistrationId) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.providerRegistrationMissing);
  }
}

function toMetadataSafeValidation(
  checkedAt: Date,
  validationResult: GitHubAppInstallationVerifyResult,
): MetadataSafeGitHubConnectionValidation {
  return toMetadataSafeGitHubValidation(checkedAt, "success", null, validationResult);
}

async function persistGitHubAppConnectionRegistration(
  input: CreateGitHubAppConnectionInput,
  validationResult: GitHubAppInstallationVerifyResult,
): Promise<MetadataSafeGitHubConnectionResult> {
  await input.appConnectionStore.createConnection({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    provider: "github",
    connectionMethod: "github-app",
    displayName: input.displayName,
    setupUserId: input.setupUserId,
    status: "active",
  });

  await storeGitHubConnectionBoundary({
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    boundary: input.boundary,
    linkage: {
      providerAccountId: input.boundary.owner,
      providerAppRegistrationId: input.providerAppRegistrationId,
    },
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  });

  await recordConnectionCreated({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
  });

  const checkedAt = new Date();
  const validatedConnection = await persistGithubConnectionValidationSuccess({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    checkedAt,
    validationResult,
    appConnectionStore: input.appConnectionStore,
  });

  return {
    connection: validatedConnection,
    validation: toMetadataSafeValidation(checkedAt, validationResult),
  };
}

export async function createGitHubAppConnection(
  input: CreateGitHubAppConnectionInput,
): Promise<MetadataSafeGitHubConnectionResult> {
  await assertCreateConnectionAccess(input);
  return runWithAppConnectionChangeEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    actor: input.actor,
    run: async () => {
      await assertProviderAppRegistrationConfigured(input);

      const validationResult = await verifyGitHubInstallation({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        appConnectionId: input.appConnectionId,
        boundary: input.boundary,
        providerAppRegistrationId: input.providerAppRegistrationId,
        githubPort: input.githubPort,
      });

      return persistGitHubAppConnectionRegistration(input, validationResult);
    },
  });
}
