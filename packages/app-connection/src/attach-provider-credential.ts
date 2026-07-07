import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  AUTH_ERROR_CODES,
  type AppConnectionId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type ProviderCredentialId,
} from "@insecur/domain";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { AppConnectionError } from "./app-connection-error.js";
import { attachEncryptedCloudflareCredential } from "./attach-encrypted-cloudflare-credential.js";
import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import type { CloudflareScopedTokenPort } from "./cloudflare-scoped-token-port.js";
import { requireAppConnectionChangeEvidence } from "./consume-app-connection-change-evidence.js";
import { persistConnectionValidationSuccess } from "./persist-connection-validation-success.js";
import {
  recordConnectionCredentialAttached,
  recordConnectionCredentialAttachDenied,
} from "./record-connection-audit.js";
import { verifyCloudflareConnectionToken } from "./verify-cloudflare-connection-token.js";
import { withCloudflareConnectionManageAccess } from "./with-cloudflare-connection-access.js";

export interface AttachProviderCredentialInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly tokenPlaintext: Uint8Array;
  readonly keyring: Keyring;
  readonly cloudflarePort: CloudflareScopedTokenPort;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function attachVerifiedProviderCredential(
  input: AttachProviderCredentialInput,
  boundary: CloudflareConnectionBoundary,
): Promise<AppConnectionRow> {
  const validationResult = await verifyCloudflareConnectionToken({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    tokenPlaintext: input.tokenPlaintext,
    boundary,
    cloudflarePort: input.cloudflarePort,
  });

  await attachEncryptedCloudflareCredential({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    credentialId: input.credentialId,
    tokenPlaintext: input.tokenPlaintext,
    keyring: input.keyring,
    appConnectionStore: input.appConnectionStore,
  });
  await recordConnectionCredentialAttached({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
  });

  return persistConnectionValidationSuccess({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    checkedAt: new Date(),
    validationResult,
    appConnectionStore: input.appConnectionStore,
  });
}

async function attachCredentialWithProjectBoundary(
  input: AttachProviderCredentialInput,
): Promise<AppConnectionRow> {
  try {
    return await withCloudflareConnectionManageAccess({
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      keyring: input.keyring,
      appConnectionStore: input.appConnectionStore,
      sensitiveMetadataStore: input.sensitiveMetadataStore,
      recordDenied: async () => {
        await recordConnectionCredentialAttachDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        });
      },
      run: async (_connection, boundary) => attachVerifiedProviderCredential(input, boundary),
    });
  } catch (error) {
    if (error instanceof AppConnectionError && error.code === APP_CONNECTION_ERROR_CODES.notFound) {
      await recordConnectionCredentialAttachDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        appConnectionId: input.appConnectionId,
        reasonCode: error.code,
      });
    }
    throw error;
  }
}

/**
 * Attaches a Cloudflare provider credential and activates the app connection. Requires
 * cleared, operation-bound high-assurance evidence and project-scoped boundary proof, and
 * verifies the candidate token against the stored boundary before activation so the
 * connection never carries validation evidence from a previous credential.
 */
export async function attachProviderCredential(
  input: AttachProviderCredentialInput,
): Promise<AppConnectionRow> {
  await requireAppConnectionChangeEvidence(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId: input.operationId,
      actor: input.actor,
    },
    async (error) => {
      await recordConnectionCredentialAttachDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        appConnectionId: input.appConnectionId,
        reasonCode: error.code,
      });
    },
  );

  return attachCredentialWithProjectBoundary(input);
}
