/** Opaque decrypt failure; does not distinguish wrong key, tampering, or identity mismatch. */
export class DecryptError extends Error {
  constructor() {
    super("decrypt failed");
    this.name = "DecryptError";
  }
}
