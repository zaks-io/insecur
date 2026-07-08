import type { Command, Command as CommanderCommand } from "commander";
import { runInitCommand, DEFAULT_INIT_PROFILE_SLUG } from "./commands/init.js";
import type { ProgramDeps } from "./program-deps.js";

export function registerInitCommand(program: Command, deps: ProgramDeps): void {
  program
    .command("init")
    .description("Provision guided organization defaults and write .insecur.json")
    .option("--profile-slug <slug>", "local CLI profile slug", DEFAULT_INIT_PROFILE_SLUG)
    .action(async function initAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ profileSlug: string }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runInitCommand(flags, api, context, {
        profileSlug: options.profileSlug,
      });
    });
}
