import { Keyring } from "@insecur/crypto";

import type { KeyStore } from "../types.js";
import { MachineRootKeyProvider } from "./machine-root-key-provider.js";
import {
  PersistingLocalDataKeySource,
  type LocalDataKeyPersistence,
} from "./local-data-key-source.js";

/** Production local keyring: machine root key + SQLite-persisted project data keys. */
export function createLocalKeyring(
  keyStore: KeyStore,
  persistence: LocalDataKeyPersistence,
): Keyring {
  const rootKeyProvider = new MachineRootKeyProvider(keyStore);
  const dataKeySource = new PersistingLocalDataKeySource(rootKeyProvider, persistence);
  return new Keyring(rootKeyProvider, dataKeySource);
}
