import type { Command, Command as CommanderCommand } from "commander";
import { runOrgsListCommand } from "./commands/orgs-list.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { registerEnvsCommands } from "./register-envs-commands.js";
import {
  registerOrgsCommands,
  registerProjectsCommands,
} from "./register-orgs-projects-commands.js";

export function registerNavigationCommands(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runOrgsListCommand>[1];
      context: Parameters<typeof runOrgsListCommand>[2];
    }>;
  },
): void {
  registerOrgsCommands(program, deps);
  registerProjectsCommands(program, deps);
  registerEnvsCommands(program, deps);
}
