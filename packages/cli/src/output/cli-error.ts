import type {
  ErrorBody,
  ErrorRemediation,
  KnownErrorCode,
  MetadataEnvelopeMeta,
} from "@insecur/domain";
import { errorEnvelope, type ErrorEnvelope } from "@insecur/domain";
import { type CliErrorOptions, resolveCliErrorOptions } from "./cli-error-options.js";
import { exitCodeForErrorCode } from "./exit-codes.js";

export class CliError extends Error {
  readonly code: KnownErrorCode;
  readonly exitCode: number;
  readonly retryable: boolean;
  readonly meta?: MetadataEnvelopeMeta;
  readonly remediation?: ErrorRemediation;
  readonly data?: Record<string, unknown>;

  constructor(
    error: ErrorBody,
    exitCodeOrOptions?: number | CliErrorOptions,
    legacyData?: Record<string, unknown>,
  ) {
    super(error.message);
    this.name = "CliError";
    this.code = error.code;
    this.retryable = error.retryable;
    const options = resolveCliErrorOptions(exitCodeOrOptions, legacyData);
    this.exitCode = options.exitCode ?? exitCodeForErrorCode(error.code);
    if (options.meta !== undefined) {
      this.meta = options.meta;
    }
    if (options.remediation !== undefined) {
      this.remediation = options.remediation;
    }
    if (options.data !== undefined) {
      this.data = options.data;
    }
  }

  toErrorBody(): ErrorBody {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }

  toErrorEnvelope(): ErrorEnvelope {
    return errorEnvelope(this.toErrorBody(), {
      ...(this.meta !== undefined ? { meta: this.meta } : {}),
      ...(this.remediation !== undefined ? { remediation: this.remediation } : {}),
    });
  }
}

export type { CliErrorOptions };

export { cliErrorFromEnvelope } from "./api-cli-error.js";
