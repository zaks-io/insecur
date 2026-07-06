import { randomBytes as nodeRandomBytes } from "node:crypto";

import { createFileFallbackAdapter } from "./adapters/file-fallback.js";
import { createLinuxSecretToolAdapter } from "./adapters/linux-secret-tool.js";
import { createMacosKeychainAdapter } from "./adapters/macos-keychain.js";
import { createWindowsDpapiAdapter } from "./adapters/windows-dpapi.js";
import { MACHINE_ROOT_KEY_ACCOUNT, MACHINE_ROOT_KEY_SERVICE } from "./constants.js";
import { createDefaultExecFile } from "./exec-file.js";
import { resolveKeyStorePaths } from "./paths.js";
import { resolveKeyStoreBackend } from "./resolve-backend.js";
import { serializeAsync, singleFlightBySlot } from "./serialize-async.js";
import type {
  CreateKeyStoreOptions,
  KeyStore,
  KeyStoreAdapter,
  KeyStoreBackend,
  KeyStoreDependencies,
  KeyStorePaths,
} from "./types.js";

function buildMachineRootKeySlot(
  backend: KeyStoreBackend,
  paths: KeyStorePaths,
  service: string,
  account: string,
): string {
  return `${backend}\u0000${paths.userConfigDir}\u0000${service}\u0000${account}`;
}

function createAdapter(
  backend: KeyStoreBackend,
  deps: KeyStoreDependencies,
  service: string,
  account: string,
): KeyStoreAdapter {
  switch (backend) {
    case "macos-keychain":
      return createMacosKeychainAdapter(deps, service, account);
    case "windows-dpapi":
      return createWindowsDpapiAdapter(deps);
    case "linux-secret-tool":
      return createLinuxSecretToolAdapter(deps, service, account);
    case "file-fallback":
      return createFileFallbackAdapter(deps);
    default: {
      const exhaustive: never = backend;
      return exhaustive;
    }
  }
}

function wrapKeyStore(adapter: KeyStoreAdapter, slot?: string): KeyStore {
  const getOrCreateMachineRootKey = slot
    ? singleFlightBySlot(slot, () => adapter.getOrCreateMachineRootKey())
    : serializeAsync(() => adapter.getOrCreateMachineRootKey());
  return {
    backend: adapter.backend,
    notice: adapter.notice,
    getOrCreateMachineRootKey,
  };
}

export function createKeyStore(options: CreateKeyStoreOptions = {}): KeyStore {
  const service = options.service ?? MACHINE_ROOT_KEY_SERVICE;
  const account = options.account ?? MACHINE_ROOT_KEY_ACCOUNT;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const deps: KeyStoreDependencies = {
    execFile: options.execFile ?? createDefaultExecFile(),
    platform,
    paths: resolveKeyStorePaths(options.configHome, env),
    env,
    randomBytes: options.randomBytes ?? nodeRandomBytes,
  };
  const backend = resolveKeyStoreBackend(platform, env);
  const adapter = createAdapter(backend, deps, service, account);
  const slot = buildMachineRootKeySlot(backend, deps.paths, service, account);

  return wrapKeyStore(adapter, slot);
}

export function createKeyStoreFromAdapter(adapter: KeyStoreAdapter): KeyStore {
  return wrapKeyStore(adapter);
}
