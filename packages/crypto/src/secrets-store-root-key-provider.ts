import { DEFAULT_ROOT_KEY_VERSION } from "./constants.js";
import { RootKeyNotConfiguredError } from "./errors.js";
import type { Keyring, KeyVersion, RootKeyProvider, TenantDataKeySource } from "./keyring.js";
import { Keyring as KeyringImpl } from "./keyring.js";
import { parseInstanceRootKeyHex } from "./root-key-material.js";

/** Cloudflare Secrets Store secret binding shape (`get(): Promise<string>`). */
export interface SecretsStoreSecretBinding {
  get(): Promise<string>;
}

export class SecretsStoreRootKeyProvider implements RootKeyProvider {
  constructor(
    private readonly binding: SecretsStoreSecretBinding,
    private readonly supportedRootKeyVersion: KeyVersion = DEFAULT_ROOT_KEY_VERSION,
  ) {}

  async getRootKeyBytes(version: KeyVersion): Promise<Uint8Array> {
    if (version !== this.supportedRootKeyVersion) {
      throw new RootKeyNotConfiguredError();
    }

    let raw: string;
    try {
      raw = await this.binding.get();
    } catch {
      throw new RootKeyNotConfiguredError();
    }

    return parseInstanceRootKeyHex(raw);
  }
}

export function createKeyringFromRootKeyProvider(
  rootKeyProvider: RootKeyProvider,
  dataKeySource: TenantDataKeySource,
): Keyring {
  return new KeyringImpl(rootKeyProvider, dataKeySource);
}

export function createKeyringFromSecretsStoreBinding(
  binding: SecretsStoreSecretBinding | undefined,
  dataKeySource: TenantDataKeySource,
): Keyring {
  if (!binding) {
    throw new RootKeyNotConfiguredError();
  }
  return createKeyringFromRootKeyProvider(new SecretsStoreRootKeyProvider(binding), dataKeySource);
}
