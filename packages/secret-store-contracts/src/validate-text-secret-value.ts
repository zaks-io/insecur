import { SECRET_ERROR_CODES } from "@insecur/domain";

import { SECRET_VALUE_SIZE_LIMIT_BYTES } from "./constants.js";
import { isValidUtf8 } from "./is-valid-utf8.js";
import { SecretWriteError } from "./secret-write-error.js";

export interface ValidateTextSecretValueOptions {
  allowEmpty?: boolean;
}

export function validateTextSecretValue(
  valueUtf8: Uint8Array,
  options: ValidateTextSecretValueOptions = {},
): void {
  if (!isValidUtf8(valueUtf8)) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.invalidEncoding,
      "Secret value must be valid UTF-8 text.",
    );
  }

  if (valueUtf8.byteLength > SECRET_VALUE_SIZE_LIMIT_BYTES) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.valueTooLarge,
      "Secret value exceeds the 64 KiB UTF-8 size limit.",
    );
  }

  if (valueUtf8.byteLength === 0 && options.allowEmpty !== true) {
    throw new SecretWriteError(
      SECRET_ERROR_CODES.emptyValue,
      "Secret value cannot be empty unless empty values are explicitly allowed.",
    );
  }
}
