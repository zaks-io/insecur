import { IMPORT_ERROR_CODES } from "@insecur/domain";

import { SecretWriteError } from "./secret-write-error.js";

export function assertCreateOnlySecretWrite(input: {
  readonly createOnly?: boolean;
  readonly createdSecretShape: boolean;
}): void {
  if (input.createOnly === true && !input.createdSecretShape) {
    throw new SecretWriteError(
      IMPORT_ERROR_CODES.existingSecret,
      "Secret already exists in the target environment.",
    );
  }
}
