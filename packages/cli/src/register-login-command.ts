import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { runLoginCommand } from "./commands/login.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_VALIDATION } from "./output/exit-codes.js";

export function parseLoginCallbackPort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--callback-port must be a whole integer from 1 to 65535.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--callback-port must be a whole integer from 1 to 65535.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  return port;
}

export function registerLoginCommand(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runLoginCommand>[1];
      context: Parameters<typeof runLoginCommand>[2];
    }>;
  },
): void {
  program
    .command("login")
    .description("Authenticate with WorkOS AuthKit PKCE and mint a memory-only CLI credential")
    .option("--no-open", "print the WorkOS login URL instead of opening a browser")
    .option("--callback-port <port>", "localhost callback port for PKCE login")
    .option(
      "--shell",
      "start a managed interactive shell with the session credential in the child environment only",
    )
    .action(async function loginAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      const options = command.opts<{
        shell?: boolean;
        open?: boolean;
        callbackPort?: string;
      }>();
      const callbackPort = parseLoginCallbackPort(options.callbackPort);
      process.exitCode = await runLoginCommand(flags, api, context, {
        shell: options.shell === true,
        openBrowser: options.open !== false,
        ...(callbackPort === undefined || Number.isNaN(callbackPort) ? {} : { callbackPort }),
      });
    });
}
