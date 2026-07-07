import { parseDisplayName, type DisplayName } from "@insecur/domain";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { readStdinBytes } from "./read-stdin.js";

export async function readDisplayNameFromStdin(flagLabel: string): Promise<DisplayName> {
  const bytes = await readStdinBytes();
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidDisplayName,
      message: `Invalid display name from ${flagLabel}.`,
      retryable: false,
    });
  }
  return parsed.value;
}
