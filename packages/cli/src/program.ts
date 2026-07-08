import { Command } from "commander";
import { applyCommanderUsageSeam } from "./output/commander-usage-error.js";
import { renderCliRunFailure } from "./output/render-cli-run-failure.js";
import { registerApiBackedCommands } from "./register-api-backed-commands.js";
import { registerConfigCommands } from "./register-config-commands.js";
import { registerGuideCommand } from "./register-guide-command.js";
import { registerInitCommand } from "./register-init-command.js";
import { registerLoginCommand } from "./register-login-command.js";
import { registerLogoutCommand } from "./register-logout-command.js";
import { registerRunCommand } from "./register-run-command.js";
import { registerScanCommand } from "./register-scan-command.js";
import { registerShellCommand } from "./register-shell-command.js";
import { attachGlobalOptions, createProgramDeps, globalFlags } from "./program-deps.js";
import { cliVersion } from "./version.js";

function createInsecurRootProgram(): Command {
  const program = attachGlobalOptions(new Command());
  applyCommanderUsageSeam(program);
  return program
    .name("insecur")
    .description("insecur CLI — metadata-only output, sealed local session auth")
    .version(cliVersion());
}

function buildProgram(): Command {
  const program = createInsecurRootProgram();
  const deps = createProgramDeps();

  registerLoginCommand(program, deps);
  registerLogoutCommand(program, deps);
  registerShellCommand(program, deps);
  registerRunCommand(program, deps);
  registerInitCommand(program, deps);
  registerScanCommand(program, { globalFlags: deps.globalFlags });
  registerGuideCommand(program);
  registerConfigCommands(program, deps.globalFlags);
  registerApiBackedCommands(program, deps);

  return program;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    const code = process.exitCode;
    return typeof code === "number" ? code : 0;
  } catch (error) {
    return renderCliRunFailure(error, globalFlags(program));
  }
}
