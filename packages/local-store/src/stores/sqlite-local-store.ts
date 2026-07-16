import type { SecretId } from "@insecur/domain";

import type { LocalAuditWriter } from "../contracts/audit-writer.js";
import type { LocalInjectionGrantStore } from "../contracts/injection-grant-store.js";
import type { LocalProjectMetadataStore } from "../contracts/project-metadata-store.js";
import type { LocalSecretVersionStore } from "../contracts/secret-version-store.js";
import type { LocalDataKeyPersistence } from "../crypto/local-data-key-source.js";
import type { LocalSqliteDatabase } from "../sqlite/connection.js";
import { SqliteLocalAuditWriter } from "./sqlite/audit-writer.js";
import { SqliteLocalDataKeyPersistence } from "./sqlite/data-key-persistence.js";
import { SqliteLocalInjectionGrantStore } from "./sqlite/injection-grant-store.js";
import { SqliteLocalProjectMetadataStore } from "./sqlite/project-metadata-store.js";
import { SqliteLocalSecretVersionStore } from "./sqlite/secret-version-store.js";

/** SQLite-backed Local Mode store implementing all contract seams. */
export class SqliteLocalStore
  implements
    LocalProjectMetadataStore,
    LocalSecretVersionStore,
    LocalInjectionGrantStore,
    LocalAuditWriter,
    LocalDataKeyPersistence
{
  private readonly dataKeys: SqliteLocalDataKeyPersistence;
  private readonly projectsStore: SqliteLocalProjectMetadataStore;
  private readonly secretVersionsStore: SqliteLocalSecretVersionStore;
  private readonly injectionGrantsStore: SqliteLocalInjectionGrantStore;
  private readonly auditWriter: SqliteLocalAuditWriter;

  constructor(database: LocalSqliteDatabase) {
    this.dataKeys = new SqliteLocalDataKeyPersistence(database);
    this.projectsStore = new SqliteLocalProjectMetadataStore(database);
    this.secretVersionsStore = new SqliteLocalSecretVersionStore(database);
    this.injectionGrantsStore = new SqliteLocalInjectionGrantStore(database);
    this.auditWriter = new SqliteLocalAuditWriter(database);
  }

  getOrganizationDataKey(version: number) {
    return this.dataKeys.getOrganizationDataKey(version);
  }

  saveOrganizationDataKey(row: {
    organizationDataKeyVersion: number;
    rootKeyVersion: number;
    wrappedStorageRef: string;
  }): string {
    return this.dataKeys.saveOrganizationDataKey(row);
  }

  getProjectDataKey(
    projectIdValue: Parameters<LocalDataKeyPersistence["getProjectDataKey"]>[0],
    version: number,
  ) {
    return this.dataKeys.getProjectDataKey(projectIdValue, version);
  }

  saveProjectDataKey(row: Parameters<LocalDataKeyPersistence["saveProjectDataKey"]>[0]): string {
    return this.dataKeys.saveProjectDataKey(row);
  }

  createProject(...args: Parameters<LocalProjectMetadataStore["createProject"]>) {
    return this.projectsStore.createProject(...args);
  }

  getProject(...args: Parameters<LocalProjectMetadataStore["getProject"]>) {
    return this.projectsStore.getProject(...args);
  }

  createEnvironment(...args: Parameters<LocalProjectMetadataStore["createEnvironment"]>) {
    return this.projectsStore.createEnvironment(...args);
  }

  getEnvironment(...args: Parameters<LocalProjectMetadataStore["getEnvironment"]>) {
    return this.projectsStore.getEnvironment(...args);
  }

  upsertSecretShape(...args: Parameters<LocalProjectMetadataStore["upsertSecretShape"]>) {
    return this.projectsStore.upsertSecretShape(...args);
  }

  getSecretShape(...args: Parameters<LocalProjectMetadataStore["getSecretShape"]>) {
    return this.projectsStore.getSecretShape(...args);
  }

  listSecretShapes(...args: Parameters<LocalProjectMetadataStore["listSecretShapes"]>) {
    return this.projectsStore.listSecretShapes(...args);
  }

  deleteProject(...args: Parameters<LocalProjectMetadataStore["deleteProject"]>) {
    return this.projectsStore.deleteProject(...args);
  }

  replaceCurrentVersion(...args: Parameters<LocalSecretVersionStore["replaceCurrentVersion"]>) {
    return this.secretVersionsStore.replaceCurrentVersion(...args);
  }

  getCurrentWrappedVersion(
    ...args: Parameters<LocalSecretVersionStore["getCurrentWrappedVersion"]>
  ) {
    return this.secretVersionsStore.getCurrentWrappedVersion(...args);
  }

  listSecretMetadata(...args: Parameters<LocalSecretVersionStore["listSecretMetadata"]>) {
    return this.secretVersionsStore.listSecretMetadata(...args);
  }

  insertGrant(...args: Parameters<LocalInjectionGrantStore["insertGrant"]>) {
    return this.injectionGrantsStore.insertGrant(...args);
  }

  tryConsumeGrant(...args: Parameters<LocalInjectionGrantStore["tryConsumeGrant"]>) {
    return this.injectionGrantsStore.tryConsumeGrant(...args);
  }

  writeEvent(...args: Parameters<LocalAuditWriter["writeEvent"]>) {
    return this.auditWriter.writeEvent(...args);
  }

  listEvents(...args: Parameters<LocalAuditWriter["listEvents"]>) {
    return this.auditWriter.listEvents(...args);
  }

  countCurrentSecretVersionRows(): number {
    return this.secretVersionsStore.countCurrentSecretVersionRows();
  }

  readRawCiphertext(secretIdValue: SecretId): Uint8Array | null {
    return this.secretVersionsStore.readRawCiphertext(secretIdValue);
  }

  readAuditDetailsJsonRows(): readonly string[] {
    const rows = this.auditWriter.readRawDetailsJsonRows();
    return rows;
  }
}
