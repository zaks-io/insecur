import type { Command, Command as CommanderCommand } from "commander";
import { runShellCommand } from "./commands/shell.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";
import type { ProgramDeps } from "./program-deps.js";

export function registerShellCommand(program: Command, deps: ProgramDeps): void {
  program
    .command("shell")
    .description("Start a subshell with INSECUR_SESSION_TOKEN in the environment")
    .argument("<profile>", "CLI profile slug or opaque id")
    .action(async function shellAction(
      profile: string,
      _options: unknown,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const context = await loadAndResolveCliContext(flags);
      process.exitCode = await runShellCommand(flags, profile, context);
    });
}
