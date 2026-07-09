import { SECRET_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { actionableRemediation } from "../output/cli-remediation.js";
import {
  parseGeneratedSecretRequest,
  type GeneratedSecretRequest,
} from "./generate-random-secret.js";
import { readMaskedPrompt } from "./masked-prompt.js";
import { readStdinBytes } from "./read-stdin.js";
import { validateSecretValueUtf8 } from "./validate-secret-value.js";

type SecretValueInputMode = "stdin" | "masked_prompt" | "generated";

export interface CollectSecretValueInput {
  readonly generateMode: string | true | undefined;
  readonly generateLength: string | undefined;
  readonly valueStdin: boolean;
  readonly allowEmpty: boolean;
  /** Exact argv the caller should retry with when no input mode was provided. */
  readonly inputRequiredUsage?: readonly string[];
}

export type CollectedSecretValue =
  | {
      readonly valueUtf8: Uint8Array;
      readonly inputMode: Exclude<SecretValueInputMode, "generated">;
    }
  | {
      readonly generate: GeneratedSecretRequest;
      readonly inputMode: "generated";
    };

function assertExclusiveInputModes(input: CollectSecretValueInput): void {
  if (input.generateMode !== undefined && input.valueStdin) {
    throw new CliError({
      code: SECRET_ERROR_CODES.invalidInputMode,
      message: "Use either --generate or --value-stdin, not both.",
      retryable: false,
    });
  }
}

function finalizeCollectedValue(
  valueUtf8: Uint8Array,
  inputMode: Exclude<SecretValueInputMode, "generated">,
  allowEmpty: boolean,
): CollectedSecretValue {
  validateSecretValueUtf8(valueUtf8, { allowEmpty });
  return { valueUtf8, inputMode };
}

function collectGeneratedValue(input: CollectSecretValueInput): CollectedSecretValue {
  return {
    generate: parseGeneratedSecretRequest(input),
    inputMode: "generated",
  };
}

export async function collectSecretValue(
  input: CollectSecretValueInput,
): Promise<CollectedSecretValue> {
  assertExclusiveInputModes(input);

  if (input.generateMode !== undefined) {
    return collectGeneratedValue(input);
  }

  if (input.valueStdin) {
    return finalizeCollectedValue(await readStdinBytes(), "stdin", input.allowEmpty);
  }

  if (process.stdin.isTTY) {
    return finalizeCollectedValue(
      await readMaskedPrompt("Secret value: "),
      "masked_prompt",
      input.allowEmpty,
    );
  }

  throw new CliError(
    {
      code: SECRET_ERROR_CODES.inputRequired,
      message:
        "Secret input is required. Use --generate, --value-stdin, or run from an interactive terminal.",
      retryable: false,
    },
    {
      remediation: actionableRemediation(SECRET_ERROR_CODES.inputRequired, {
        suggestedFix:
          "Pipe the existing value with --value-stdin, or run interactively for a masked prompt. Only use --generate random to mint a brand-new random secret.",
        usage: input.inputRequiredUsage ?? [
          "insecur",
          "secrets",
          "set",
          "<VARIABLE_KEY>",
          "--value-stdin",
        ],
      }),
    },
  );
}
