import type { Command, Command as CommanderCommand } from "commander";
import { runLogoutCommand } from "./commands/logout.js";
import type { ProgramDeps } from "./program-deps.js";

export function registerLogoutCommand(program: Command, deps: ProgramDeps): void {
  program
    .command("logout")
    .description("End the CLI session locally and revoke the server session")
    .action(async function logoutAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runLogoutCommand(flags, api, context);
    });
}
