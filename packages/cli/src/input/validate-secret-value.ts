import { SECRET_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { SECRET_VALUE_SIZE_LIMIT_BYTES } from "./secret-value-limits.js";

export interface ValidateSecretValueOptions {
  readonly allowEmpty?: boolean;
}

function assertValidUtf8(valueUtf8: Uint8Array): void {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(valueUtf8);
  } catch {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidEncoding,
      message: "Secret value must be valid UTF-8 text.",
      retryable: false,
    });
  }
}

function assertNoNullBytes(valueUtf8: Uint8Array): void {
  if (valueUtf8.includes(0)) {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidEncoding,
      message:
        "Secret value cannot contain a NUL character because process environments cannot represent it safely.",
      retryable: false,
    });
  }
}

export function validateSecretValueUtf8(
  valueUtf8: Uint8Array,
  options: ValidateSecretValueOptions = {},
): void {
  assertValidUtf8(valueUtf8);
  assertNoNullBytes(valueUtf8);

  if (valueUtf8.byteLength > SECRET_VALUE_SIZE_LIMIT_BYTES) {
    throw new CliError({
      code: SECRET_ERROR_CODES.valueTooLarge,
      message: "Secret value exceeds the 64 KiB UTF-8 size limit.",
      retryable: false,
    });
  }

  if (valueUtf8.byteLength === 0 && options.allowEmpty !== true) {
    throw new CliError({
      code: SECRET_ERROR_CODES.emptyValue,
      message: "Secret value cannot be empty unless --allow-empty is set.",
      retryable: false,
    });
  }
}
