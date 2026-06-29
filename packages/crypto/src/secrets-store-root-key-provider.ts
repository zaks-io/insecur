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
      // eslint-disable-next-line no-console
      console.error(`ROOTKEY_DIAG version_mismatch got=${version} want=${this.supportedRootKeyVersion}`);
      throw new RootKeyNotConfiguredError();
    }

    let raw: string;
    try {
      raw = await this.binding.get();
    } catch (error) {
      // TEMP DIAG (preview): the binding.get() threw — log its class/message (NEVER the value).
      // eslint-disable-next-line no-console
      console.error(
        `ROOTKEY_DIAG get_threw name=${error instanceof Error ? error.name : typeof error} msg=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new RootKeyNotConfiguredError();
    }

    // TEMP DIAG (preview): the binding returned — log only the SHAPE so a malformed value is
    // distinguishable from a throw. Never logs the value itself.
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    // eslint-disable-next-line no-console
    console.error(
      `ROOTKEY_DIAG got_value type=${typeof raw} len=${trimmed.length} is_hex=${/^[0-9a-fA-F]+$/.test(trimmed)}`,
    );
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
