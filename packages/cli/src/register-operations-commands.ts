import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { runOperationsCancelCommand } from "./commands/operations-cancel.js";
import { runOperationsGetCommand } from "./commands/operations-get.js";
import { runOperationsWaitCommand } from "./commands/operations-wait.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_VALIDATION } from "./output/exit-codes.js";

export function parseOperationsWaitTimeout(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--timeout must be a whole number of seconds of at least 1.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const timeoutSeconds = Number(value);
  if (!Number.isSafeInteger(timeoutSeconds)) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--timeout must be a whole number of seconds of at least 1.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  return timeoutSeconds;
}

export function registerOperationsCommands(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runOperationsGetCommand>[1];
      context: Parameters<typeof runOperationsGetCommand>[2];
    }>;
  },
): void {
  const operations = program
    .command("operations")
    .description("Poll, wait on, and cancel long-running operations");

  operations
    .command("get")
    .description("Read metadata-only operation state")
    .argument("<operation-id>", "operation opaque id")
    .action(async function operationsGetAction(this: CommanderCommand, operationId: string) {
      const flags = deps.globalFlags(this);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOperationsGetCommand(flags, api, context, operationId);
    });

  operations
    .command("wait")
    .description("Poll until the operation reaches a terminal state")
    .argument("<operation-id>", "operation opaque id")
    .option("--timeout <seconds>", "fail with operation.wait_timeout when exceeded")
    .action(async function operationsWaitAction(this: CommanderCommand, operationId: string) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{ timeout?: string }>();
      const timeoutSeconds = parseOperationsWaitTimeout(options.timeout);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOperationsWaitCommand(flags, api, context, {
        operationId,
        ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
      });
    });

  operations
    .command("cancel")
    .description("Cancel a cancelable operation")
    .argument("<operation-id>", "operation opaque id")
    .action(async function operationsCancelAction(this: CommanderCommand, operationId: string) {
      const flags = deps.globalFlags(this);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOperationsCancelCommand(flags, api, context, operationId);
    });
}
