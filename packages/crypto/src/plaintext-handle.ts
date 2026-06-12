const PLAINTEXT_HANDLE_SERIALIZATION_ERROR =
  "PlaintextHandle must not be serialized; unwrap only at an approved egress point (ADR-0071).";

/**
 * Non-serializable carrier for decrypt output. Secondary tripwire under the
 * decrypt-import lint boundary (ADR-0071).
 */
export class PlaintextHandle {
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  /** Unwrap only at a named approved egress consumption point. */
  unwrapUtf8(): Uint8Array {
    return this.#bytes;
  }

  toJSON(): never {
    throw new Error(PLAINTEXT_HANDLE_SERIALIZATION_ERROR);
  }
}
