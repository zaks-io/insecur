import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { listSecretMatrixRowsByProject } from "./secret-matrix-metadata-queries.js";
import {
  listEnvironmentSecretMetadataRows,
  listSecretVersionMetadataRows,
} from "./environment-secret-metadata-queries.js";
import type {
  ListEnvironmentSecretsInput,
  ListSecretVersionMetadataInput,
} from "./environment-secret-metadata-types.js";
import type {
  EnvironmentSecretMetadataRow,
  SecretVersionMetadataRow,
} from "./environment-secret-metadata-types.js";
import type {
  ListSecretMatrixByProjectInput,
  SecretMatrixSecretRow,
} from "./secret-matrix-metadata-types.js";

/**
 * Tenant-qualified secret matrix metadata reads. Returns only allowlisted metadata columns and
 * never selects ciphertext storage refs or wrapped material.
 */
export class TenantSecretMatrixMetadataStore {
  constructor(private readonly db: TenantScopedDb) {}

  async listByProject(
    input: ListSecretMatrixByProjectInput,
  ): Promise<readonly SecretMatrixSecretRow[]> {
    return listSecretMatrixRowsByProject(this.db, input);
  }

  async listByEnvironment(
    input: ListEnvironmentSecretsInput,
  ): Promise<readonly EnvironmentSecretMetadataRow[]> {
    return listEnvironmentSecretMetadataRows(this.db, input);
  }

  async listVersionMetadata(
    input: ListSecretVersionMetadataInput,
  ): Promise<readonly SecretVersionMetadataRow[]> {
    return listSecretVersionMetadataRows(this.db, input);
  }
}
