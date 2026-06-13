import { DEFAULT_ROOT_KEY_VERSION } from "./constants.js";
import { RootKeyNotConfiguredError } from "./errors.js";
import { createKeyring, type Keyring, type KeyVersion, type RootKeyProvider } from "./keyring.js";
import { parseInstanceRootKeyHex } from "./root-key-material.js";

/** Development-only env var for local root key iteration (ADR-0064). */
export const INSTANCE_ROOT_KEY_HEX_ENV = "INSECUR_INSTANCE_ROOT_KEY_HEX";

/** Whether plaintext env root-key resolution is permitted (ADR-0064). */
export type CryptoRuntimeMode = "development" | "production";

/**
 * ADR-0064 guard for request-owned crypto calls.
 * This module validates caller-supplied keyrings only; it must not retain key material.
 */
export function requireKeyring(keyring: Keyring | undefined): Keyring {
  if (keyring) {
    return keyring;
  }

  throw new RootKeyNotConfiguredError();
}

export function readInstanceRootKeyHexFromProcessEnv(): string | undefined {
  return process.env[INSTANCE_ROOT_KEY_HEX_ENV];
}

/**
 * ADR-0064: refuse plaintext env root keys in production; allow in development only.
 * Production callers must use the Cloudflare Secrets Store binding (ADR-0028).
 */
export function resolveInstanceRootKeyFromEnv(input: {
  readonly runtimeMode: CryptoRuntimeMode;
  readonly envHex?: string | undefined;
}): Uint8Array {
  if (input.runtimeMode === "production") {
    throw new RootKeyNotConfiguredError();
  }

  return parseInstanceRootKeyHex(input.envHex);
}

/** RootKeyProvider that reads `INSECUR_INSTANCE_ROOT_KEY_HEX` only in development (ADR-0064). */
export class EnvRootKeyProvider implements RootKeyProvider {
  constructor(
    private readonly runtimeMode: CryptoRuntimeMode,
    private readonly envHex: string | undefined = readInstanceRootKeyHexFromProcessEnv(),
    private readonly supportedRootKeyVersion: KeyVersion = DEFAULT_ROOT_KEY_VERSION,
  ) {}

  async getRootKeyBytes(version: KeyVersion): Promise<Uint8Array> {
    if (version !== this.supportedRootKeyVersion) {
      throw new RootKeyNotConfiguredError();
    }

    return await Promise.resolve(
      resolveInstanceRootKeyFromEnv({
        runtimeMode: this.runtimeMode,
        envHex: this.envHex,
      }),
    );
  }
}

/** Convenience keyring for local development when Secrets Store bindings are unavailable. */
export function createKeyringFromDevEnvRootKey(
  runtimeMode: CryptoRuntimeMode,
  envHex: string | undefined = readInstanceRootKeyHexFromProcessEnv(),
): Keyring {
  return createKeyring(
    resolveInstanceRootKeyFromEnv({
      runtimeMode,
      envHex,
    }),
  );
}
