export const KEY_STORE_ERROR_CODES = {
  unavailable: "local_store.unavailable",
  invalidMaterial: "local_store.invalid_key_material",
  adapterFailed: "local_store.adapter_failed",
} as const;

export type KeyStoreErrorCode = (typeof KEY_STORE_ERROR_CODES)[keyof typeof KEY_STORE_ERROR_CODES];

export class KeyStoreError extends Error {
  readonly code: KeyStoreErrorCode;

  constructor(code: KeyStoreErrorCode, message: string) {
    super(message);
    this.name = "KeyStoreError";
    this.code = code;
  }
}
