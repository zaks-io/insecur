import type { Command, Command as CommanderCommand } from "commander";
import { runLoginCommand } from "./commands/login.js";
import type { GlobalCliFlags } from "./cli-options.js";

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
      const callbackPort =
        options.callbackPort === undefined ? undefined : Number.parseInt(options.callbackPort, 10);
      process.exitCode = await runLoginCommand(flags, api, context, {
        shell: options.shell === true,
        openBrowser: options.open !== false,
        ...(callbackPort === undefined || Number.isNaN(callbackPort) ? {} : { callbackPort }),
      });
    });
}
