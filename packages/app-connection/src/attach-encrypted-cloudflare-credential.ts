import { encryptProviderCredential, type Keyring } from "@insecur/crypto";
import type {
  AppConnectionId,
  OrganizationId,
  ProjectId,
  ProviderCredentialId,
  UserId,
} from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import { attachProviderCredentialUnchecked } from "./attach-provider-credential-unchecked.js";
import {
  recordConnectionCredentialAttachDenied,
  toConnectionAuditReasonCode,
} from "./record-connection-audit.js";

export interface AttachEncryptedCloudflareCredentialInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly tokenPlaintext: Uint8Array;
  readonly keyring: Keyring;
  readonly appConnectionStore: TenantAppConnectionStore;
}

/**
 * Encrypts the verified scoped token and attaches it as the active provider credential.
 * Attach failures are audited as `connection.credential_attach_denied` and rethrown.
 */
export async function attachEncryptedCloudflareCredential(
  input: AttachEncryptedCloudflareCredentialInput,
): Promise<AppConnectionRow> {
  const wrapped = await encryptProviderCredential(
    input.keyring,
    {
      organizationId: input.organizationId,
      appConnectionId: input.appConnectionId,
      provider: "scoped-api-token",
      credentialId: input.credentialId,
    },
    input.tokenPlaintext,
  );

  try {
    return await attachProviderCredentialUnchecked({
      organizationId: input.organizationId,
      appConnectionId: input.appConnectionId,
      credentialId: input.credentialId,
      wrapped,
      appConnectionStore: input.appConnectionStore,
    });
  } catch (error) {
    await recordConnectionCredentialAttachDenied({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      reasonCode: toConnectionAuditReasonCode(error),
    });
    throw error;
  }
}
