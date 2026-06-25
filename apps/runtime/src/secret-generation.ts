import {
  MAX_GENERATED_SECRET_RANDOM_BYTES,
  SECRET_ERROR_CODES,
  bytesToBase64Url,
} from "@insecur/domain";
import { SecretWriteError } from "@insecur/secret-store";
import type { RuntimeGeneratedSecretInput } from "@insecur/worker-kit";

export function generateSecretValueUtf8(input: RuntimeGeneratedSecretInput): Uint8Array {
  if (!Number.isInteger(input.lengthBytes) || input.lengthBytes < 1) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.invalidInputMode,
      "Generated secret length must be a positive integer.",
    );
  }
  if (input.lengthBytes > MAX_GENERATED_SECRET_RANDOM_BYTES) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.valueTooLarge,
      "Generated secret length exceeds the V1 secret value size limit.",
    );
  }

  const entropy = new Uint8Array(input.lengthBytes);
  crypto.getRandomValues(entropy);
  return new TextEncoder().encode(bytesToBase64Url(entropy));
}
