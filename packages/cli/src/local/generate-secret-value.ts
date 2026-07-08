import {
  MAX_GENERATED_SECRET_RANDOM_BYTES,
  SECRET_ERROR_CODES,
  bytesToBase64Url,
} from "@insecur/domain";

export interface GeneratedSecretInput {
  readonly mode: "random";
  readonly lengthBytes: number;
}

export class LocalSecretGenerationError extends Error {
  readonly code: (typeof SECRET_ERROR_CODES)[keyof typeof SECRET_ERROR_CODES];

  constructor(code: (typeof SECRET_ERROR_CODES)[keyof typeof SECRET_ERROR_CODES], message: string) {
    super(message);
    this.name = "LocalSecretGenerationError";
    this.code = code;
  }
}

/** Mirrors Runtime `generateSecretValueUtf8` for offline Local Mode writes. */
export function generateSecretValueUtf8(input: GeneratedSecretInput): Uint8Array {
  if (!Number.isInteger(input.lengthBytes) || input.lengthBytes < 1) {
    throw new LocalSecretGenerationError(
      SECRET_ERROR_CODES.invalidInputMode,
      "Generated secret length must be a positive integer.",
    );
  }
  if (input.lengthBytes > MAX_GENERATED_SECRET_RANDOM_BYTES) {
    throw new LocalSecretGenerationError(
      SECRET_ERROR_CODES.valueTooLarge,
      "Generated secret length exceeds the V1 secret value size limit.",
    );
  }

  const entropy = new Uint8Array(input.lengthBytes);
  crypto.getRandomValues(entropy);
  return new TextEncoder().encode(bytesToBase64Url(entropy));
}
