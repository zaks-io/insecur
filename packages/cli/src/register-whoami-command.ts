import type { Command, Command as CommanderCommand } from "commander";
import { runWhoamiCommand } from "./commands/whoami.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerWhoamiCommand(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runWhoamiCommand>[1];
      context: Parameters<typeof runWhoamiCommand>[2];
    }>;
  },
): void {
  program
    .command("whoami")
    .description("Report acting human, session validity, resolved context, and attribution tier")
    .action(async function whoamiAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runWhoamiCommand(flags, api, context);
    });
}
