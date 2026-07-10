import type { Command, Command as CommanderCommand } from "commander";
import { childCommandAfterSeparator } from "./commander-argv.js";
import { runAgentEnvCommand } from "./commands/agent-env.js";
import { runAgentRegisterCommand } from "./commands/agent-register.js";
import { runAgentShellCommand } from "./commands/agent-shell.js";
import { runAgentStatusCommand } from "./commands/agent-status.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";
import { parseAgentAllow, parseAgentTtl } from "./commands/agent-session-policy.js";
import { runAgentSetupCommand } from "./commands/agent-setup.js";

function agentPolicyOptions(command: CommanderCommand) {
  const options = command.opts<{ allow?: string; ttl?: string }>();
  const allow = parseAgentAllow(options.allow);
  const ttlSeconds = parseAgentTtl(options.ttl);
  return {
    ...(allow === undefined ? {} : { allow }),
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
  };
}

function attachAgentPolicyOptions(command: Command): Command {
  return command
    .option(
      "--allow <capabilities>",
      "comma-separated task capabilities: secrets:list, secrets:set, run, operations:cancel",
    )
    .option("--ttl <seconds>", "derived session lifetime from 60 to 86400 seconds");
}
import type { ProgramDeps } from "./program-deps.js";

function registerAgentStatus(agent: Command, deps: ProgramDeps): void {
  agent
    .command("status")
    .description("Report agent readiness, resolved context, capabilities, and exact next actions")
    .action(async function agentStatusAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const context = await loadAndResolveCliContext(flags);
      process.exitCode = await runAgentStatusCommand(flags, context);
    });
}

function registerAgentSetup(agent: Command, deps: ProgramDeps): void {
  agent
    .command("setup")
    .description("Install or verify project-local agent instructions and scan hooks")
    .requiredOption("--harness <name>", "agent harness: codex or claude")
    .option("--mode <mode>", "scan hook mode: advisory or strict", "advisory")
    .option("--dry-run", "report the files that would change")
    .option("--check", "exit 7 when managed agent setup has drifted")
    .action(async function agentSetupAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        harness: string;
        mode: string;
        dryRun?: boolean;
        check?: boolean;
      }>();
      process.exitCode = await runAgentSetupCommand(flags, {
        harness: options.harness,
        mode: options.mode,
        dryRun: options.dryRun === true,
        check: options.check === true,
      });
    });
}

function registerAgentShell(agent: Command, deps: ProgramDeps): void {
  attachAgentPolicyOptions(agent.command("shell"))
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
      process.exitCode = await runAgentShellCommand({
        flags,
        api,
        context,
        command: childCommandAfterSeparator(command),
        policy: agentPolicyOptions(command),
      });
    });
}

function registerAgentEnv(agent: Command, deps: ProgramDeps): void {
  attachAgentPolicyOptions(agent.command("env"))
    .description("Print metadata-only shell exports for a separately launched agent harness")
    .action(async function agentEnvAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAgentEnvCommand(flags, api, context, agentPolicyOptions(command));
    });
}

function registerAgentRegister(agent: Command, deps: ProgramDeps): void {
  agent
    .command("register")
    .description("Register a structural agent session for audit attribution")
    .action(async function agentRegisterAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAgentRegisterCommand(flags, api, context);
    });
}

export function registerAgentCommands(program: Command, deps: ProgramDeps): void {
  const agent = program
    .command("agent")
    .description("Agent harness attribution and child sessions");
  registerAgentStatus(agent, deps);
  registerAgentSetup(agent, deps);
  registerAgentShell(agent, deps);
  registerAgentEnv(agent, deps);
  registerAgentRegister(agent, deps);
}
