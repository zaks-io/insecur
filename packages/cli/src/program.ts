import { Command } from "commander";
import {
  applyCommanderUsageSeam,
  resetCommanderUsageCapture,
} from "./output/commander-usage-error.js";
import { renderCliRunFailure } from "./output/render-cli-run-failure.js";
import { registerAgentCommands } from "./register-agent-commands.js";
import { registerApiBackedCommands } from "./register-api-backed-commands.js";
import { registerConfigCommands } from "./register-config-commands.js";
import { registerGuideCommand } from "./register-guide-command.js";
import { registerInitCommand } from "./register-init-command.js";
import { registerLoginCommand } from "./register-login-command.js";
import { registerLogoutCommand } from "./register-logout-command.js";
import { registerRunCommand } from "./register-run-command.js";
import { registerScanCommand } from "./register-scan-command.js";
import { registerShellCommand } from "./register-shell-command.js";
import { configureIdTruncation } from "./output/cell-format.js";
import { configureColor } from "./output/style.js";
import {
  attachGlobalOptions,
  createProgramDeps,
  globalFlags,
  renderFlags,
} from "./program-deps.js";
import { cliVersion } from "./version.js";
import { NOOP_CRASH_REPORTER, type CliCrashReporter } from "./crash-reporting.js";

function createInsecurRootProgram(): Command {
  const program = attachGlobalOptions(new Command());
  applyCommanderUsageSeam(program);
  program.hook("preAction", (thisCommand) => {
    const flags = globalFlags(thisCommand);
    configureColor(flags);
    configureIdTruncation(flags.full);
  });
  return program
    .name("insecur")
    .description("insecur CLI — metadata-only output, sealed local session auth")
    .version(cliVersion())
    .addHelpText(
      "after",
      "\nCrash reporting: on by default for unexpected CLI failures. Tracing is enabled for every CLI command. Disable crash reports with --no-crash-reports, INSECUR_CRASH_REPORTS=off, or `insecur config set crash-reports off`.",
    );
}

function buildProgram(options: { readonly crashReporter: CliCrashReporter }): Command {
  const program = createInsecurRootProgram();
  const deps = createProgramDeps({ traceHeaders: options.crashReporter.traceHeaders });

  registerLoginCommand(program, deps);
  registerLogoutCommand(program, deps);
  registerShellCommand(program, deps);
  registerAgentCommands(program, deps);
  registerRunCommand(program, deps);
  registerInitCommand(program, deps);
  registerScanCommand(program, { globalFlags: deps.globalFlags });
  registerGuideCommand(program);
  registerConfigCommands(program, deps.globalFlags);
  registerApiBackedCommands(program, deps);

  return program;
}

export async function runCli(
  argv: readonly string[],
  options: { readonly crashReporter?: CliCrashReporter } = {},
): Promise<number> {
  resetCommanderUsageCapture();
  const crashReporter = options.crashReporter ?? NOOP_CRASH_REPORTER;
  const program = buildProgram({ crashReporter });
  try {
    await crashReporter.withCommandTrace(argv, () => program.parseAsync(argv));
    const code = process.exitCode;
    return typeof code === "number" ? code : 0;
  } catch (error) {
    return await renderCliRunFailure(error, renderFlags(program), crashReporter);
  }
}
