import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { DEFAULT_LOGIN_CALLBACK_TIMEOUT_SECONDS } from "./commands/login-pkce.js";
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

export function parseLoginCallbackTimeout(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--callback-timeout must be a whole number of seconds from 1 to 3600.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const timeoutSeconds = Number(value);
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds > 3600) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--callback-timeout must be a whole number of seconds from 1 to 3600.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  return timeoutSeconds;
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
    .description("Authenticate with WorkOS AuthKit PKCE and mint a short-lived CLI credential")
    .option("--no-open", "print the WorkOS login URL instead of opening a browser")
    .option("--callback-port <port>", "localhost callback port for PKCE login")
    .option(
      "--callback-timeout <seconds>",
      `seconds to wait for the loopback PKCE callback (default: ${String(DEFAULT_LOGIN_CALLBACK_TIMEOUT_SECONDS)})`,
    )
    .option(
      "--no-persist",
      "keep the session credential in process memory only instead of the sealed local session store",
    )
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
        persist?: boolean;
        callbackPort?: string;
        callbackTimeout?: string;
      }>();
      const callbackPort = parseLoginCallbackPort(options.callbackPort);
      const callbackTimeoutSeconds = parseLoginCallbackTimeout(options.callbackTimeout);
      process.exitCode = await runLoginCommand(flags, api, context, {
        shell: options.shell === true,
        openBrowser: options.open !== false,
        persist: options.persist !== false,
        ...(callbackPort === undefined || Number.isNaN(callbackPort) ? {} : { callbackPort }),
        ...(callbackTimeoutSeconds === undefined ? {} : { callbackTimeoutSeconds }),
      });
    });
}
