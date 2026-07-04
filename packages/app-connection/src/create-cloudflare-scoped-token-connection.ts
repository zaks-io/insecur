import { auditAccessDenialOnFailure } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import {
  type AppConnectionId,
  type DisplayName,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type ProviderCredentialId,
  type UserId,
} from "@insecur/domain";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import {
  assertConnectionManageScope,
  isConnectionAccessDenied,
} from "./assert-connection-access.js";
import { attachEncryptedCloudflareCredential } from "./attach-encrypted-cloudflare-credential.js";
import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import { requireAppConnectionChangeEvidence } from "./consume-app-connection-change-evidence.js";
import type {
  CloudflareScopedTokenPort,
  CloudflareScopedTokenVerifyResult,
} from "./cloudflare-scoped-token-port.js";
import { persistConnectionValidationSuccess } from "./persist-connection-validation-success.js";
import {
  recordConnectionCreated,
  recordConnectionCreateDenied,
  recordConnectionCredentialAttached,
  toConnectionAuditReasonCode,
} from "./record-connection-audit.js";
import { verifyCloudflareConnectionToken } from "./verify-cloudflare-connection-token.js";
import { storeCloudflareConnectionBoundary } from "./store-cloudflare-connection-boundary.js";

export interface CreateCloudflareScopedTokenConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly displayName: DisplayName;
  readonly setupUserId: UserId;
  readonly boundary: CloudflareConnectionBoundary;
  readonly tokenPlaintext: Uint8Array;
  readonly keyring: Keyring;
  readonly cloudflarePort: CloudflareScopedTokenPort;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export interface MetadataSafeCloudflareConnectionValidation {
  readonly checkedAt: string;
  readonly outcome: "success" | "failed";
  readonly reasonCode: string | null;
  readonly tokenStatus: "active" | "invalid" | null;
  readonly workerScriptReachable: boolean | null;
  readonly hasBoundaryWarning: boolean | null;
}

export interface MetadataSafeCloudflareConnectionResult {
  readonly connection: AppConnectionRow;
  readonly validation: MetadataSafeCloudflareConnectionValidation;
}

async function assertCreateConnectionAccess(
  input: CreateCloudflareScopedTokenConnectionInput,
): Promise<void> {
  try {
    await assertConnectionManageScope(input.actor, input.organizationId, input.projectId);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isConnectionAccessDenied,
      recordDenied: async () => {
        await recordConnectionCreateDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          reasonCode: toConnectionAuditReasonCode(error),
        });
      },
    });
    throw error;
  }
}

async function verifyCloudflareTokenForCreate(
  input: CreateCloudflareScopedTokenConnectionInput,
): Promise<CloudflareScopedTokenVerifyResult> {
  return verifyCloudflareConnectionToken({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    tokenPlaintext: input.tokenPlaintext,
    boundary: input.boundary,
    cloudflarePort: input.cloudflarePort,
  });
}

async function persistCloudflareConnectionDraft(
  input: CreateCloudflareScopedTokenConnectionInput,
  validationResult: CloudflareScopedTokenVerifyResult,
): Promise<void> {
  await input.appConnectionStore.createConnection({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    provider: "cloudflare",
    connectionMethod: "scoped-api-token",
    displayName: input.displayName,
    setupUserId: input.setupUserId,
    status: "pending_setup",
  });

  await storeCloudflareConnectionBoundary({
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    boundary: input.boundary,
    providerAccountId: validationResult.providerAccountId,
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  });
}

async function attachEncryptedCredentialForCreate(
  input: CreateCloudflareScopedTokenConnectionInput,
): Promise<AppConnectionRow> {
  return attachEncryptedCloudflareCredential({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    credentialId: input.credentialId,
    tokenPlaintext: input.tokenPlaintext,
    keyring: input.keyring,
    appConnectionStore: input.appConnectionStore,
  });
}

function toMetadataSafeValidation(
  checkedAt: Date,
  validationResult: CloudflareScopedTokenVerifyResult,
): MetadataSafeCloudflareConnectionValidation {
  return {
    checkedAt: checkedAt.toISOString(),
    outcome: "success",
    reasonCode: null,
    tokenStatus: validationResult.tokenStatus,
    workerScriptReachable: validationResult.workerScriptReachable,
    hasBoundaryWarning: validationResult.hasBoundaryWarning,
  };
}

async function finalizeCloudflareConnectionCreate(
  input: CreateCloudflareScopedTokenConnectionInput,
  validationResult: CloudflareScopedTokenVerifyResult,
  activated: AppConnectionRow,
): Promise<MetadataSafeCloudflareConnectionResult> {
  await recordConnectionCreated({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
  });
  await recordConnectionCredentialAttached({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
  });

  const checkedAt = new Date();
  const validatedConnection = await persistConnectionValidationSuccess({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    checkedAt,
    validationResult,
    appConnectionStore: input.appConnectionStore,
  });

  return {
    connection: validatedConnection.id === activated.id ? validatedConnection : activated,
    validation: toMetadataSafeValidation(checkedAt, validationResult),
  };
}

export async function createCloudflareScopedTokenConnection(
  input: CreateCloudflareScopedTokenConnectionInput,
): Promise<MetadataSafeCloudflareConnectionResult> {
  await assertCreateConnectionAccess(input);
  await requireAppConnectionChangeEvidence(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId: input.operationId,
      actor: input.actor,
    },
    async (error) => {
      await recordConnectionCreateDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        reasonCode: error.code,
      });
    },
  );

  const validationResult = await verifyCloudflareTokenForCreate(input);
  await persistCloudflareConnectionDraft(input, validationResult);
  const activated = await attachEncryptedCredentialForCreate(input);

  return finalizeCloudflareConnectionCreate(input, validationResult, activated);
}
