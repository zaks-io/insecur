import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { readConfirmPrompt } from "../input/confirm-prompt.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";

export interface LocalFilesRmCommandOptions {
  readonly filePath: string;
  readonly yes: boolean;
}

async function confirmDeletion(filePath: string, yes: boolean): Promise<boolean> {
  if (yes) {
    return true;
  }
  return readConfirmPrompt(`Delete local file ${filePath}? [y/N] `);
}

function reportCancelled(flags: GlobalCliFlags): void {
  if (!flags.quiet && !flags.json) {
    process.stderr.write("Deletion cancelled.\n");
  }
}

function reportDeleted(filePath: string, flags: GlobalCliFlags): void {
  if (!flags.json && !flags.quiet) {
    process.stdout.write(`Deleted ${filePath}.\n`);
  }
}

export async function runLocalFilesRmCommand(
  flags: GlobalCliFlags,
  commandOptions: LocalFilesRmCommandOptions,
): Promise<number> {
  const filePath = resolve(commandOptions.filePath);
  const confirmed = await confirmDeletion(filePath, commandOptions.yes);
  if (!confirmed) {
    reportCancelled(flags);
    return EXIT_VALIDATION;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete file.";
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message,
      retryable: false,
    });
  }

  reportDeleted(filePath, flags);
  return 0;
}
