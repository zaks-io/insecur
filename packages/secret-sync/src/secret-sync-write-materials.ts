import type { PlaintextHandle } from "@insecur/crypto";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretSyncBindingId,
  SecretSyncId,
  SecretVersionId,
} from "@insecur/domain";

/**
 * One binding's write-ready materials: the decrypted provider destination
 * name plus the decrypted eligible source value. Both exist only inside the
 * active run request after Sync Execution Revalidation; the engine hands them
 * straight to the provider write port and never persists, logs, or audits
 * them. Only the opaque ids on this shape may appear in metadata.
 */
export interface SecretSyncBindingWriteMaterial {
  readonly bindingId: SecretSyncBindingId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly destinationName: string;
  readonly value: PlaintextHandle;
}

export interface ResolveSecretSyncWriteMaterialsInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly bindings: readonly {
    readonly bindingId: SecretSyncBindingId;
    readonly secretId: SecretId;
  }[];
}

/**
 * Resolves one binding's provider-side destination name inside the caller's
 * authorized seam. The Runtime deploy implements this with the allowlisted
 * Sensitive Metadata decrypt (ADR-0071); tests use fakes. Provider adapters
 * need it because Explicit Provider Lookup checks one exact configured name.
 */
export interface SecretSyncDestinationNameResolver {
  resolveDestinationName(input: {
    readonly organizationId: OrganizationId;
    readonly secretSyncId: SecretSyncId;
    readonly bindingId: SecretSyncBindingId;
  }): Promise<string>;
}

/**
 * Decrypt seam for sync write execution. The Runtime deploy implements this
 * with the ADR-0071 allowlisted decrypt module
 * (`decrypt-secret-sync-write-materials.ts`); tests use fakes. Resolution is
 * all-or-nothing: a binding without an eligible Current Version fails the
 * whole set with `sync.source_value_missing` before any provider write.
 */
export interface SecretSyncWriteMaterialsResolver {
  resolveWriteMaterials(
    input: ResolveSecretSyncWriteMaterialsInput,
  ): Promise<readonly SecretSyncBindingWriteMaterial[]>;
}
