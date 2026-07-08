import {
  environmentId,
  projectId,
  secretId,
  secretVersionId,
  type EnvironmentId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

import type { LocalSecretVersionStore } from "../../contracts/secret-version-store.js";
import type {
  LocalReplaceCurrentVersionInput,
  LocalSecretMetadataRow,
  LocalSecretVersionRow,
} from "../../contracts/types.js";
import type { LocalSqliteDatabase } from "../../sqlite/connection.js";
import { withSqliteTransaction } from "../../sqlite/transaction.js";
import { assertOpaqueId, brandVariableKey, nowIso, toWrappedMaterial } from "./helpers.js";

export class SqliteLocalSecretVersionStore implements LocalSecretVersionStore {
  constructor(private readonly database: LocalSqliteDatabase) {}

  replaceCurrentVersion(input: LocalReplaceCurrentVersionInput): Promise<void> {
    assertOpaqueId(input.projectId, "projectId");
    assertOpaqueId(input.environmentId, "environmentId");
    assertOpaqueId(input.secretId, "secretId");
    assertOpaqueId(input.secretVersionId, "secretVersionId");
    assertOpaqueId(input.variableKey, "variableKey");
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
    upsertSecretPointer(this.database, input, timestamp);
    upsertCurrentSecretVersion(this.database, input, timestamp, ciphertextBuffer);
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
        `SELECT s.project_id, s.environment_id, s.id, s.variable_key, s.current_version_id,
                csv.value_byte_length, csv.encoding_class, csv.is_empty,
                csv.has_leading_or_trailing_whitespace, csv.looks_like_placeholder,
                csv.secret_shape_match_verdict
         FROM secrets s
         LEFT JOIN current_secret_versions csv ON csv.secret_id = s.id
         WHERE s.project_id = ? AND s.environment_id = ?
         ORDER BY s.variable_key ASC`,
      )
      .all(projectIdValue, environmentIdValue) as unknown as SecretMetadataDbRow[];
    return Promise.resolve(
      rows.map((row) => {
        const descriptiveVerdicts = toDescriptiveVerdictsFromMetadataRow(row);
        return {
          projectId: projectId.brand(row.project_id),
          environmentId: environmentId.brand(row.environment_id),
          secretId: secretId.brand(row.id),
          variableKey: brandVariableKey(row.variable_key),
          hasCurrentVersion: row.current_version_id !== null,
          ...(descriptiveVerdicts !== null ? { descriptiveVerdicts } : {}),
        };
      }),
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

function upsertSecretPointer(
  database: LocalSqliteDatabase,
  input: LocalReplaceCurrentVersionInput,
  timestamp: string,
): void {
  const existingSecret = database
    .prepare(`SELECT id FROM secrets WHERE id = ?`)
    .get(input.secretId) as { id: string } | undefined;
  if (existingSecret) {
    database
      .prepare(`UPDATE secrets SET current_version_id = ?, updated_at = ? WHERE id = ?`)
      .run(input.secretVersionId, timestamp, input.secretId);
    return;
  }
  database
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

function upsertCurrentSecretVersion(
  database: LocalSqliteDatabase,
  input: LocalReplaceCurrentVersionInput,
  timestamp: string,
  ciphertextBuffer: Buffer,
): void {
  database
    .prepare(
      `INSERT INTO current_secret_versions
       (secret_id, secret_version_id, organization_data_key_version, project_data_key_version, ciphertext,
        value_byte_length, encoding_class, is_empty, has_leading_or_trailing_whitespace,
        looks_like_placeholder, secret_shape_match_verdict, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(secret_id) DO UPDATE SET
         secret_version_id = excluded.secret_version_id,
         organization_data_key_version = excluded.organization_data_key_version,
         project_data_key_version = excluded.project_data_key_version,
         ciphertext = excluded.ciphertext,
         value_byte_length = excluded.value_byte_length,
         encoding_class = excluded.encoding_class,
         is_empty = excluded.is_empty,
         has_leading_or_trailing_whitespace = excluded.has_leading_or_trailing_whitespace,
         looks_like_placeholder = excluded.looks_like_placeholder,
         secret_shape_match_verdict = excluded.secret_shape_match_verdict,
         created_at = excluded.created_at`,
    )
    .run(
      input.secretId,
      input.secretVersionId,
      input.wrapped.organizationDataKeyVersion,
      input.wrapped.projectDataKeyVersion,
      ciphertextBuffer,
      input.descriptiveVerdicts.valueByteLength,
      input.descriptiveVerdicts.encodingClass,
      input.descriptiveVerdicts.isEmpty ? 1 : 0,
      input.descriptiveVerdicts.hasLeadingOrTrailingWhitespace ? 1 : 0,
      input.descriptiveVerdicts.looksLikePlaceholder ? 1 : 0,
      input.descriptiveVerdicts.secretShapeMatchVerdict,
      timestamp,
    );
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
  value_byte_length: number | null;
  encoding_class: "utf-8" | "hex-shaped" | "base64-shaped" | null;
  is_empty: number | null;
  has_leading_or_trailing_whitespace: number | null;
  looks_like_placeholder: number | null;
  secret_shape_match_verdict: "matches" | "does_not_match" | "no_shape_rule" | null;
}

function toDescriptiveVerdictsFromMetadataRow(
  row: SecretMetadataDbRow,
): SecretWriteDescriptiveVerdicts | null {
  if (
    row.current_version_id === null ||
    row.value_byte_length === null ||
    row.encoding_class === null ||
    row.is_empty === null ||
    row.has_leading_or_trailing_whitespace === null ||
    row.looks_like_placeholder === null ||
    row.secret_shape_match_verdict === null
  ) {
    return null;
  }
  return {
    valueByteLength: row.value_byte_length,
    encodingClass: row.encoding_class,
    isEmpty: row.is_empty === 1,
    hasLeadingOrTrailingWhitespace: row.has_leading_or_trailing_whitespace === 1,
    looksLikePlaceholder: row.looks_like_placeholder === 1,
    secretShapeMatchVerdict: row.secret_shape_match_verdict,
  };
}
