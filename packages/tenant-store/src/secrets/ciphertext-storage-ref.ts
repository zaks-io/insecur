/** Prefix for inline ciphertext bytes stored in `secret_versions.ciphertext_storage_ref`. */
export const INLINE_CIPHERTEXT_STORAGE_PREFIX = "inline:b64:" as const;

export function encodeInlineCiphertextStorageRef(ciphertext: Uint8Array): string {
  const encoded = Buffer.from(ciphertext).toString("base64");
  return `${INLINE_CIPHERTEXT_STORAGE_PREFIX}${encoded}`;
}

export function decodeInlineCiphertextStorageRef(storageRef: string): Uint8Array {
  if (!storageRef.startsWith(INLINE_CIPHERTEXT_STORAGE_PREFIX)) {
    throw new Error("invalid ciphertext storage ref");
  }
  const encoded = storageRef.slice(INLINE_CIPHERTEXT_STORAGE_PREFIX.length);
  return new Uint8Array(Buffer.from(encoded, "base64"));
}
