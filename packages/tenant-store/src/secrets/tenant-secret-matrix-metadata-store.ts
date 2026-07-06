import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { listSecretMatrixRowsByProject } from "./secret-matrix-metadata-queries.js";
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
}
