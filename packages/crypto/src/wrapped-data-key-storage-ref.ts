/** Prefix for inline wrapped data-key bytes stored in `wrapped_storage_ref`. */
export const INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX = "inline:b64:" as const;

export function encodeInlineWrappedDataKeyStorageRef(wrappedBytes: Uint8Array): string {
  const encoded = Buffer.from(wrappedBytes).toString("base64");
  return `${INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX}${encoded}`;
}

export function decodeInlineWrappedDataKeyStorageRef(storageRef: string): Uint8Array {
  if (!storageRef.startsWith(INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX)) {
    throw new Error("invalid wrapped data key storage ref");
  }
  const encoded = storageRef.slice(INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX.length);
  return new Uint8Array(Buffer.from(encoded, "base64"));
}
