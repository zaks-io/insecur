import { encryptSensitiveMetadata, type Keyring } from "@insecur/crypto";
import type { SensitiveMetadataFieldKey, SensitiveMetadataType } from "@insecur/custody-contracts";
import type { OpaqueResourceId, OrganizationId, ProjectId } from "@insecur/domain";
import type { TenantSensitiveMetadataStore } from "@insecur/tenant-store";

const textEncoder = new TextEncoder();

export async function upsertEncryptedMetadataField(input: {
  readonly organizationId: OrganizationId;
  readonly scopeProjectId: ProjectId | "";
  readonly metadataType: SensitiveMetadataType;
  readonly recordResourceId: OpaqueResourceId;
  readonly fieldKey: SensitiveMetadataFieldKey;
  readonly plaintext: string;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}): Promise<void> {
  const wrapped = await encryptSensitiveMetadata(
    input.keyring,
    {
      organizationId: input.organizationId,
      scopeProjectId: input.scopeProjectId,
      metadataType: input.metadataType,
      recordResourceId: input.recordResourceId,
      fieldKey: input.fieldKey,
    },
    textEncoder.encode(input.plaintext),
  );

  await input.sensitiveMetadataStore.upsertField({
    organizationId: input.organizationId,
    scopeProjectId: input.scopeProjectId,
    metadataType: input.metadataType,
    recordResourceId: input.recordResourceId,
    fieldKey: input.fieldKey,
    wrapped,
  });
}
