import { parseInstanceRootKeyHex, type KeyVersion, type RootKeyProvider } from "@insecur/crypto";

import { LOCAL_DEFAULT_ROOT_KEY_VERSION } from "../constants.js";

import { assertMachineRootKeyHex } from "../machine-root-key.js";
import type { KeyStore } from "../types.js";

/** RootKeyProvider backed by the machine-local KeyStore seam. */
export class MachineRootKeyProvider implements RootKeyProvider {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly supportedRootKeyVersion: KeyVersion = LOCAL_DEFAULT_ROOT_KEY_VERSION,
  ) {}

  async getRootKeyBytes(version: KeyVersion): Promise<Uint8Array> {
    if (version !== this.supportedRootKeyVersion) {
      throw new Error("unsupported root key version");
    }
    const keyHex = await this.keyStore.getOrCreateMachineRootKey();
    return parseInstanceRootKeyHex(assertMachineRootKeyHex(keyHex));
  }
}
