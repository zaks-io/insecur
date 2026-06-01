import { SECRET_ERROR_CODES } from "@insecur/domain";

import { SecretWriteError } from "./secret-write-error.js";

/** Safe ingress paths that may supply a Sensitive Value for Blind Secret Write. */
export type SafeSecretValueIngress = "stdin" | "generated" | "request_body" | "masked_prompt";

const UNSAFE_INGRESS = new Set([
  "argv",
  "query",
  "route_param",
  "file",
  "named_local_value_file",
  "get_request",
] as const);

/**
 * Rejects ingress modes that must never carry Sensitive Values (argv, query, files, …).
 * @throws {SecretWriteError} with `secret.input_required` when ingress is unsafe.
 */
export function assertSafeSecretValueIngress(ingress: string): void {
  if ((UNSAFE_INGRESS as ReadonlySet<string>).has(ingress)) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.inputRequired,
      "Secret values must use a safe input path (stdin, generation, or request body).",
    );
  }
}

/**
 * Rejects named local value files used for ordinary secret writes.
 * @throws {SecretWriteError} with `secret.input_required`.
 */
export function rejectNamedLocalValueFile(path: string | undefined): void {
  if (path !== undefined && path.trim() !== "") {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.inputRequired,
      "Named local value files are not allowed for secret writes.",
    );
  }
}
