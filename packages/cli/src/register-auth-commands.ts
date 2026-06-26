import type { Command, Command as CommanderCommand } from "commander";
import { runLoginCommand } from "./commands/login.js";
import { runLogoutCommand } from "./commands/logout.js";
import type { GlobalCliFlags } from "./cli-options.js";
import type { ResolvedCliContext } from "./config/load-cli-context.js";
import type { ApiClient } from "./api/types.js";

const DEFAULT_COOKIE_ENV = "INSECUR_WORKOS_COOKIE";
const DEFAULT_CSRF_ENV = "INSECUR_WORKOS_CSRF";

interface AuthCommandDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (
    flags: GlobalCliFlags,
  ) => Promise<{ api: ApiClient; context: ResolvedCliContext }>;
}

export function registerAuthCommands(program: Command, deps: AuthCommandDeps): void {
  program
    .command("login")
    .description("Exchange a WorkOS browser session for a CLI credential (memory/env handoff only)")
    .option("--cookie-env <name>", "env var with WorkOS Cookie header", DEFAULT_COOKIE_ENV)
    .option("--csrf-env <name>", "env var with CSRF header", DEFAULT_CSRF_ENV)
    .option(
      "--print-export",
      "print shell export assignments to stdout for eval (no disk persistence)",
    )
    .action(async function loginAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      const options = command.opts<{ cookieEnv: string; csrfEnv: string; printExport?: boolean }>();
      process.exitCode = await runLoginCommand(flags, api, context, {
        cookieEnv: options.cookieEnv,
        csrfEnv: options.csrfEnv,
        ...(options.printExport === true ? { printExport: true } : {}),
      });
    });

  program
    .command("logout")
    .description("Clear the in-process CLI session credential from memory")
    .action(function logoutAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      process.exitCode = runLogoutCommand(flags);
    });
}
