import type { ErrorBody, KnownErrorCode } from "@insecur/domain";
import { exitCodeForErrorCode } from "./exit-codes.js";

export class CliError extends Error {
  readonly code: KnownErrorCode;
  readonly exitCode: number;
  readonly retryable: boolean;
  readonly data?: Record<string, unknown>;

  constructor(error: ErrorBody, exitCode?: number, data?: Record<string, unknown>) {
    super(error.message);
    this.name = "CliError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.exitCode = exitCode ?? exitCodeForErrorCode(error.code);
    if (data !== undefined) {
      this.data = data;
    }
  }

  toErrorBody(): ErrorBody {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}
