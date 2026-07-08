import type { Command, Command as CommanderCommand } from "commander";
import { registerAuditCommands } from "./audit-commands.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { runWhoamiCommand } from "./commands/whoami.js";
import { registerNavigationCommands } from "./register-navigation-commands.js";
import { registerOperationsCommands } from "./register-operations-commands.js";
import { registerRunPoliciesCommands } from "./register-run-policies-commands.js";
import { registerSecretsCommands } from "./register-secrets-commands.js";
import { registerWhoamiCommand } from "./register-whoami-command.js";

interface ApiBackedCommandDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runWhoamiCommand>[1];
    context: Parameters<typeof runWhoamiCommand>[2];
  }>;
}

export function registerApiBackedCommands(program: Command, deps: ApiBackedCommandDeps): void {
  registerAuditCommands(program, deps);
  registerSecretsCommands(program, deps);
  registerNavigationCommands(program, deps);
  registerOperationsCommands(program, deps);
  registerRunPoliciesCommands(program, deps);
  registerWhoamiCommand(program, deps);
}
