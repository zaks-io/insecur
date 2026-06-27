import { SECRET_ERROR_CODES } from "@insecur/domain";

import { SecretWriteError } from "./secret-write-error.js";

/** Safe ingress paths that may supply a Sensitive Value for Blind Secret Write. */
export type SafeSecretValueIngress = "stdin" | "generated" | "request_body" | "masked_prompt";

const SAFE_INGRESS = new Set<SafeSecretValueIngress>([
  "stdin",
  "generated",
  "request_body",
  "masked_prompt",
]);

function isSafeSecretValueIngress(ingress: string): ingress is SafeSecretValueIngress {
  return (SAFE_INGRESS as ReadonlySet<string>).has(ingress);
}

export function assertSafeSecretValueIngress(ingress: string): void {
  if (!isSafeSecretValueIngress(ingress)) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.inputRequired,
      "Secret values must use a safe input path (stdin, generation, or request body).",
    );
  }
}

export function rejectNamedLocalValueFile(path: string | undefined): void {
  if (path !== undefined && path.trim() !== "") {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.inputRequired,
      "Named local value files are not allowed for secret writes.",
    );
  }
}
