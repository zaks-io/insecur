import type { OpaqueResourceId, OrganizationId, ProjectId } from "@insecur/domain";
import type {
  SensitiveMetadataFieldKey,
  SensitiveMetadataType,
  WrappedSensitiveMetadata,
} from "@insecur/crypto";

export interface UpsertSensitiveMetadataInput {
  readonly organizationId: OrganizationId;
  readonly scopeProjectId: ProjectId | "";
  readonly metadataType: SensitiveMetadataType;
  readonly recordResourceId: OpaqueResourceId;
  readonly fieldKey: SensitiveMetadataFieldKey;
  readonly wrapped: WrappedSensitiveMetadata;
}

export type GetSensitiveMetadataFieldInput = Omit<UpsertSensitiveMetadataInput, "wrapped">;

export interface StoredWrappedSensitiveMetadata {
  readonly organizationDataKeyVersion: number;
  readonly projectDataKeyVersion: number | null;
  readonly ciphertext: Uint8Array;
}

export interface SensitiveMetadataFieldRow {
  readonly organizationId: OrganizationId;
  readonly scopeProjectId: ProjectId | null;
  readonly metadataType: SensitiveMetadataType;
  readonly recordResourceId: OpaqueResourceId;
  readonly fieldKey: SensitiveMetadataFieldKey;
  readonly wrapped: StoredWrappedSensitiveMetadata;
}
