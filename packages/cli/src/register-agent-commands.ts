import type { Command, Command as CommanderCommand } from "commander";
import { childCommandAfterSeparator } from "./commander-argv.js";
import { runAgentEnvCommand } from "./commands/agent-env.js";
import { runAgentRegisterCommand } from "./commands/agent-register.js";
import { runAgentShellCommand } from "./commands/agent-shell.js";
import type { ProgramDeps } from "./program-deps.js";

export function registerAgentCommands(program: Command, deps: ProgramDeps): void {
  const agent = program
    .command("agent")
    .description("Agent harness attribution and child sessions");

  agent
    .command("shell")
    .description(
      "Run a command in a deny-by-default child environment with a derived agent session",
    )
    .addHelpText(
      "after",
      "\nUsage: insecur agent shell -- <command...>\n\nThe `--` separator is required before the child command.\n",
    )
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async function agentShellAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAgentShellCommand(
        flags,
        api,
        context,
        childCommandAfterSeparator(command),
      );
    });

  agent
    .command("env")
    .description("Print metadata-only shell exports for a separately launched agent harness")
    .action(async function agentEnvAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAgentEnvCommand(flags, api, context);
    });

  agent
    .command("register")
    .description("Register a structural agent session for audit attribution")
    .action(async function agentRegisterAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAgentRegisterCommand(flags, api, context);
    });
}
