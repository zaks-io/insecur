import {
  createKeyStore,
  createLocalStore,
  type KeyStore,
  type LocalStore,
} from "@insecur/local-store";
import { resolveUserConfigDir } from "../config/paths.js";

export interface OpenLocalStoreOptions {
  readonly configHome?: string;
  readonly keyStore?: KeyStore;
}

export function openLocalStore(options: OpenLocalStoreOptions = {}): LocalStore {
  const configHome = options.configHome ?? resolveUserConfigDir();
  return createLocalStore({
    keyStore: options.keyStore ?? createKeyStore({ configHome }),
    configHome,
  });
}
