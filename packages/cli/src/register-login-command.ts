import type { Command, Command as CommanderCommand } from "commander";
import { runLoginCommand } from "./commands/login.js";
import type { GlobalCliFlags } from "./cli-options.js";

const DEFAULT_COOKIE_ENV = "INSECUR_WORKOS_COOKIE";
const DEFAULT_CSRF_ENV = "INSECUR_WORKOS_CSRF";

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
    .description("Exchange a WorkOS browser session for a memory-only CLI credential")
    .option("--cookie-env <name>", "env var with WorkOS Cookie header", DEFAULT_COOKIE_ENV)
    .option("--csrf-env <name>", "env var with CSRF header", DEFAULT_CSRF_ENV)
    .option(
      "--shell",
      "start a managed interactive shell with the session credential in the child environment only",
    )
    .action(async function loginAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      const options = command.opts<{ cookieEnv: string; csrfEnv: string; shell?: boolean }>();
      process.exitCode = await runLoginCommand(flags, api, context, {
        cookieEnv: options.cookieEnv,
        csrfEnv: options.csrfEnv,
        shell: options.shell === true,
      });
    });
}
