import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  AUTH_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantProviderCredentialStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { auditKnownConnectionValidationDenials } from "./audit-known-connection-validation-denials.js";
import { AppConnectionError } from "./app-connection-error.js";
import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import type { CloudflareScopedTokenPort } from "./cloudflare-scoped-token-port.js";
import {
  assertConnectionReadyForValidation,
  recordConnectionValidationFailure,
} from "./connection-validation-helpers.js";
import { decryptProviderCredentialForCloudflareValidation } from "./decrypt-provider-credential-for-validation.js";
import { persistConnectionValidationSuccess } from "./persist-connection-validation-success.js";
import { recordConnectionValidationDenied } from "./record-connection-audit.js";
import { type MetadataSafeCloudflareConnectionValidation } from "./create-cloudflare-scoped-token-connection.js";
import { withCloudflareConnectionReadAccess } from "./with-cloudflare-connection-access.js";

export interface ValidateCloudflareScopedTokenConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly cloudflarePort: CloudflareScopedTokenPort;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly providerCredentialStore: TenantProviderCredentialStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

function toValidationMetadata(
  checkedAt: Date,
  outcome: "success" | "failed",
  reasonCode: string | null,
  validation?: {
    tokenStatus: "active" | "invalid";
    workerScriptReachable: boolean;
    hasBoundaryWarning: boolean;
  },
): MetadataSafeCloudflareConnectionValidation {
  return {
    checkedAt: checkedAt.toISOString(),
    outcome,
    reasonCode,
    tokenStatus: validation?.tokenStatus ?? null,
    workerScriptReachable: validation?.workerScriptReachable ?? null,
    hasBoundaryWarning: validation?.hasBoundaryWarning ?? null,
  };
}

function assertCloudflareConnectionReadyForValidation(connection: AppConnectionRow): void {
  assertConnectionReadyForValidation(connection);
  if (connection.activeCredentialId === null) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.credentialMissing);
  }
}

async function loadCloudflareValidationToken(
  input: ValidateCloudflareScopedTokenConnectionInput,
  connection: AppConnectionRow,
): Promise<string> {
  assertCloudflareConnectionReadyForValidation(connection);
  const credentialId = connection.activeCredentialId;
  if (credentialId === null) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.credentialMissing);
  }

  const storedCredential = await input.providerCredentialStore.getCredential(
    input.organizationId,
    credentialId,
  );
  if (!storedCredential) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.credentialMissing);
  }

  const tokenPlaintext = await decryptProviderCredentialForCloudflareValidation(
    input.keyring,
    {
      organizationId: input.organizationId,
      appConnectionId: input.appConnectionId,
      provider: "scoped-api-token",
      credentialId,
    },
    storedCredential.wrapped,
  );
  return new TextDecoder().decode(tokenPlaintext.unwrapUtf8());
}

async function validateActiveCloudflareConnection(
  input: ValidateCloudflareScopedTokenConnectionInput,
  connection: AppConnectionRow,
  boundary: CloudflareConnectionBoundary,
): Promise<MetadataSafeCloudflareConnectionValidation> {
  const token = await loadCloudflareValidationToken(input, connection);
  const checkedAt = new Date();

  let validationResult;
  try {
    validationResult = await input.cloudflarePort.verifyScopedToken({
      token,
      allowedAccountId: boundary.allowedAccountId,
      allowedWorkerScript: boundary.allowedWorkerScript,
    });
  } catch (error) {
    return recordConnectionValidationFailure({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      checkedAt,
      appConnectionStore: input.appConnectionStore,
      error,
    });
  }

  await persistConnectionValidationSuccess({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    checkedAt,
    validationResult,
    appConnectionStore: input.appConnectionStore,
  });

  return toValidationMetadata(checkedAt, "success", null, validationResult);
}

export async function validateCloudflareScopedTokenConnection(
  input: ValidateCloudflareScopedTokenConnectionInput,
): Promise<MetadataSafeCloudflareConnectionValidation> {
  try {
    return await withCloudflareConnectionReadAccess({
      ...input,
      recordDenied: async () => {
        await recordConnectionValidationDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        });
      },
      run: async (connection, boundary) =>
        validateActiveCloudflareConnection(input, connection, boundary),
    });
  } catch (error) {
    await auditKnownConnectionValidationDenials({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      error,
      reasonCodes: [
        APP_CONNECTION_ERROR_CODES.notFound,
        APP_CONNECTION_ERROR_CODES.disconnected,
        APP_CONNECTION_ERROR_CODES.credentialMissing,
      ],
    });
    throw error;
  }
}
