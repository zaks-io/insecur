/** Bytes persisted by metadata stores (no caller identity echo). */
export function toStoreFacingCiphertext(wrapped: { ciphertext: Uint8Array }): Uint8Array {
  return wrapped.ciphertext;
}
