import type { Command, Command as CommanderCommand } from "commander";
import { runOperationsCancelCommand } from "./commands/operations-cancel.js";
import { runOperationsGetCommand } from "./commands/operations-get.js";
import { runOperationsWaitCommand } from "./commands/operations-wait.js";
import type { GlobalCliFlags } from "./cli-options.js";

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
    .action(async function operationsGetAction(operationId: string, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOperationsGetCommand(flags, api, context, operationId);
    });

  operations
    .command("wait")
    .description("Poll until the operation reaches a terminal state")
    .argument("<operation-id>", "operation opaque id")
    .option("--timeout <seconds>", "fail with operation.wait_timeout when exceeded")
    .action(async function operationsWaitAction(operationId: string, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ timeout?: string }>();
      const timeoutSeconds =
        options.timeout === undefined ? undefined : Number.parseInt(options.timeout, 10);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOperationsWaitCommand(flags, api, context, {
        operationId,
        ...(timeoutSeconds === undefined || Number.isNaN(timeoutSeconds) ? {} : { timeoutSeconds }),
      });
    });

  operations
    .command("cancel")
    .description("Cancel a cancelable operation")
    .argument("<operation-id>", "operation opaque id")
    .action(async function operationsCancelAction(operationId: string, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOperationsCancelCommand(flags, api, context, operationId);
    });
}
