import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";

export function requireDisplayNameStdinFlag(enabled: boolean): void {
  if (!enabled) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Display Name is required via --display-name-stdin.",
      retryable: false,
    });
  }
}
