import type { Keyring } from "@insecur/crypto";

import type { LocalAuditWriter } from "./contracts/audit-writer.js";
import type { LocalInjectionGrantStore } from "./contracts/injection-grant-store.js";
import type { LocalProjectMetadataStore } from "./contracts/project-metadata-store.js";
import type { LocalSecretVersionStore } from "./contracts/secret-version-store.js";
import { createLocalKeyring } from "./crypto/local-keyring.js";
import { resolveLocalStorePaths } from "./paths.js";
import {
  closeLocalSqliteDatabase,
  openLocalSqliteDatabase,
  type LocalSqliteDatabase,
} from "./sqlite/connection.js";
import { SqliteLocalStore } from "./stores/sqlite-local-store.js";
import type { KeyStore, LocalStorePaths } from "./types.js";

export interface LocalStore {
  readonly paths: LocalStorePaths;
  readonly keyring: Keyring;
  readonly projects: LocalProjectMetadataStore;
  readonly secretVersions: LocalSecretVersionStore;
  readonly injectionGrants: LocalInjectionGrantStore;
  readonly audit: LocalAuditWriter;
  close(): void;
}

export interface CreateLocalStoreOptions {
  readonly keyStore: KeyStore;
  readonly configHome?: string;
  readonly databaseFilePath?: string;
}

export function createLocalStore(options: CreateLocalStoreOptions): LocalStore {
  const paths = resolveLocalStorePaths(options.configHome);
  const databaseFilePath = options.databaseFilePath ?? paths.databaseFilePath;
  const database = openLocalSqliteDatabase(databaseFilePath);
  return assembleLocalStore(database, options.keyStore, { ...paths, databaseFilePath });
}

export function createLocalStoreForTest(input: {
  keyStore: KeyStore;
  database: LocalSqliteDatabase;
  paths?: LocalStorePaths;
}): LocalStore {
  return assembleLocalStore(
    input.database,
    input.keyStore,
    input.paths ??
      ({
        userConfigDir: "/tmp/insecur-test",
        machineRootKeyFilePath: "/tmp/insecur-test/machine-root-key",
        machineRootKeyDpapiFilePath: "/tmp/insecur-test/machine-root-key.dpapi",
        databaseFilePath: "/tmp/insecur-test/local-store.sqlite",
      } satisfies LocalStorePaths),
  );
}

function assembleLocalStore(
  database: LocalSqliteDatabase,
  keyStore: KeyStore,
  paths: LocalStorePaths,
): LocalStore {
  try {
    const store = new SqliteLocalStore(database);
    const keyring = createLocalKeyring(keyStore, store);
    return {
      paths,
      keyring,
      projects: store,
      secretVersions: store,
      injectionGrants: store,
      audit: store,
      close() {
        closeLocalSqliteDatabase(database);
      },
    };
  } catch (error) {
    closeLocalSqliteDatabase(database);
    throw error;
  }
}
