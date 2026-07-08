import type { Command } from "commander";
import { registerAuditCommands } from "./audit-commands.js";
import { registerNavigationCommands } from "./register-navigation-commands.js";
import { registerOperationsCommands } from "./register-operations-commands.js";
import type { ProgramDeps } from "./program-deps.js";
import { registerConnectionsCommands } from "./register-connections-commands.js";
import { registerRunPoliciesCommands } from "./register-run-policies-commands.js";
import { registerSecretsCommands } from "./register-secrets-commands.js";
import { registerWhoamiCommand } from "./register-whoami-command.js";

export function registerApiBackedCommands(program: Command, deps: ProgramDeps): void {
  registerAuditCommands(program, deps);
  registerSecretsCommands(program, deps);
  registerNavigationCommands(program, deps);
  registerOperationsCommands(program, deps);
  registerRunPoliciesCommands(program, deps);
  registerConnectionsCommands(program, deps);
  registerWhoamiCommand(program, deps);
}
