import { SECRET_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import {
  DEFAULT_GENERATE_LENGTH_BYTES,
  MAX_GENERATED_SECRET_RANDOM_BYTES,
} from "./secret-value-limits.js";

export interface GeneratedSecretRequest {
  readonly mode: "random";
  readonly lengthBytes: number;
}

const POSITIVE_BASE10_INTEGER_PATTERN = /^\d+$/;

function parsePositiveBase10Integer(raw: string): number {
  if (!POSITIVE_BASE10_INTEGER_PATTERN.test(raw)) {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidInputMode,
      message: "--length must be a positive integer.",
      retryable: false,
    });
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidInputMode,
      message: "--length must be a positive integer.",
      retryable: false,
    });
  }
  return parsed;
}

export function parseGenerateLength(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_GENERATE_LENGTH_BYTES;
  }
  const parsed = parsePositiveBase10Integer(raw);
  if (parsed > MAX_GENERATED_SECRET_RANDOM_BYTES) {
    throw new CliError({
      code: SECRET_ERROR_CODES.valueTooLarge,
      message: "--length would exceed the V1 secret value size limit.",
      retryable: false,
    });
  }
  return parsed;
}

export function assertSupportedGenerateMode(mode: string | true | undefined): "random" {
  if (mode === undefined) {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidInputMode,
      message: "--generate requires a mode. Supported modes: random.",
      retryable: false,
    });
  }
  const normalized = mode === true ? "random" : mode;
  if (normalized !== "random") {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidInputMode,
      message: `Unsupported --generate mode: ${normalized}. Supported modes: random.`,
      retryable: false,
    });
  }
  return normalized;
}

export function parseGeneratedSecretRequest(input: {
  readonly generateMode: string | true | undefined;
  readonly generateLength: string | undefined;
}): GeneratedSecretRequest {
  return {
    mode: assertSupportedGenerateMode(input.generateMode),
    lengthBytes: parseGenerateLength(input.generateLength),
  };
}
