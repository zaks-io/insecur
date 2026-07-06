import type { KeyStore, KeyStoreBackend } from "./types.js";

export function createFakeKeyStore(input: { keyHex: string; backend?: KeyStoreBackend }): KeyStore {
  return {
    backend: input.backend ?? "file-fallback",
    notice: null,
    async getOrCreateMachineRootKey() {
      return Promise.resolve(input.keyHex);
    },
  };
}
