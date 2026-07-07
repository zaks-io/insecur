import {
  environmentId,
  projectId,
  secretId,
  secretVersionId,
  type EnvironmentId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";

import type { LocalSecretVersionStore } from "../../contracts/secret-version-store.js";
import type {
  LocalReplaceCurrentVersionInput,
  LocalSecretMetadataRow,
  LocalSecretVersionRow,
} from "../../contracts/types.js";
import type { LocalSqliteDatabase } from "../../sqlite/connection.js";
import { withSqliteTransaction } from "../../sqlite/transaction.js";
import { brandVariableKey, nowIso, toWrappedMaterial } from "./helpers.js";

export class SqliteLocalSecretVersionStore implements LocalSecretVersionStore {
  constructor(private readonly database: LocalSqliteDatabase) {}

  replaceCurrentVersion(input: LocalReplaceCurrentVersionInput): Promise<void> {
    withSqliteTransaction(this.database, () => {
      this.writeCurrentVersion(input, nowIso(), Buffer.from(input.wrapped.ciphertext));
    });
    return Promise.resolve();
  }

  private writeCurrentVersion(
    input: LocalReplaceCurrentVersionInput,
    timestamp: string,
    ciphertextBuffer: Buffer,
  ): void {
    const existingSecret = this.database
      .prepare(`SELECT id FROM secrets WHERE id = ?`)
      .get(input.secretId) as { id: string } | undefined;
    if (existingSecret) {
      this.database
        .prepare(`UPDATE secrets SET current_version_id = ?, updated_at = ? WHERE id = ?`)
        .run(input.secretVersionId, timestamp, input.secretId);
    } else {
      this.database
        .prepare(
          `INSERT INTO secrets
           (id, project_id, environment_id, variable_key, current_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.secretId,
          input.projectId,
          input.environmentId,
          input.variableKey,
          input.secretVersionId,
          timestamp,
          timestamp,
        );
    }
    this.database
      .prepare(
        `INSERT INTO current_secret_versions
         (secret_id, secret_version_id, organization_data_key_version, project_data_key_version, ciphertext, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(secret_id) DO UPDATE SET
           secret_version_id = excluded.secret_version_id,
           organization_data_key_version = excluded.organization_data_key_version,
           project_data_key_version = excluded.project_data_key_version,
           ciphertext = excluded.ciphertext,
           created_at = excluded.created_at`,
      )
      .run(
        input.secretId,
        input.secretVersionId,
        input.wrapped.organizationDataKeyVersion,
        input.wrapped.projectDataKeyVersion,
        ciphertextBuffer,
        timestamp,
      );
  }

  getCurrentWrappedVersion(
    projectIdValue: ProjectId,
    secretIdValue: SecretId,
  ): Promise<LocalSecretVersionRow | null> {
    const row = this.database
      .prepare(
        `SELECT s.id AS secret_id, csv.secret_version_id, csv.organization_data_key_version,
                csv.project_data_key_version, csv.ciphertext
         FROM secrets s
         INNER JOIN current_secret_versions csv ON csv.secret_id = s.id
         WHERE s.project_id = ? AND s.id = ?`,
      )
      .get(projectIdValue, secretIdValue) as CurrentVersionDbRow | undefined;
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      secretId: secretId.brand(row.secret_id),
      secretVersionId: secretVersionId.brand(row.secret_version_id),
      wrapped: toWrappedMaterial(row),
    });
  }

  listSecretMetadata(
    projectIdValue: ProjectId,
    environmentIdValue: EnvironmentId,
  ): Promise<readonly LocalSecretMetadataRow[]> {
    const rows = this.database
      .prepare(
        `SELECT project_id, environment_id, id, variable_key, current_version_id
         FROM secrets
         WHERE project_id = ? AND environment_id = ?
         ORDER BY variable_key ASC`,
      )
      .all(projectIdValue, environmentIdValue) as unknown as SecretMetadataDbRow[];
    return Promise.resolve(
      rows.map((row) => ({
        projectId: projectId.brand(row.project_id),
        environmentId: environmentId.brand(row.environment_id),
        secretId: secretId.brand(row.id),
        variableKey: brandVariableKey(row.variable_key),
        hasCurrentVersion: row.current_version_id !== null,
      })),
    );
  }

  countCurrentSecretVersionRows(): number {
    const row = this.database
      .prepare(`SELECT COUNT(*) AS count FROM current_secret_versions`)
      .get() as { count: number };
    return row.count;
  }

  readRawCiphertext(secretIdValue: SecretId): Uint8Array | null {
    const row = this.database
      .prepare(`SELECT ciphertext FROM current_secret_versions WHERE secret_id = ?`)
      .get(secretIdValue) as { ciphertext: Buffer } | undefined;
    if (!row) {
      return null;
    }
    return new Uint8Array(row.ciphertext);
  }
}

interface CurrentVersionDbRow {
  secret_id: string;
  secret_version_id: string;
  organization_data_key_version: number;
  project_data_key_version: number;
  ciphertext: Buffer;
}

interface SecretMetadataDbRow {
  project_id: string;
  environment_id: string;
  id: string;
  variable_key: string;
  current_version_id: string | null;
}
