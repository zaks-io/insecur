import { errorEnvelope } from "@insecur/domain";
import { Command, type Command as CommanderCommand } from "commander";
import { createHttpApiClientForHost } from "./api/http-client.js";
import { parseGlobalOptions } from "./cli-options.js";
import { runInitCommand, DEFAULT_INIT_PROFILE_SLUG } from "./commands/init.js";
import { registerAuthCommands } from "./register-auth-commands.js";
import { registerAuditCommands } from "./audit-commands.js";
import { runShellCommand } from "./commands/shell.js";
import { registerRunCommand } from "./register-run-command.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_UNEXPECTED } from "./output/exit-codes.js";
import { renderEnvelope } from "./output/render.js";
import { registerSecretsCommands } from "./register-secrets-commands.js";

function attachGlobalOptions(command: Command): Command {
  return command
    .option("--host <url>", "insecur API host")
    .option("--org-id <id>", "organization opaque id")
    .option("--project-id <id>", "project opaque id")
    .option("--env-id <id>", "environment opaque id")
    .option("--profile <slug>", "CLI profile slug")
    .option("--profile-id <id>", "CLI profile opaque id")
    .option("--config-dir <path>", "directory containing .insecur.json")
    .option("--json", "metadata-only JSON output")
    .option("--quiet", "suppress non-essential human output")
    .option("--verbose", "verbose logging");
}

function globalFlags(command: CommanderCommand): GlobalCliFlags {
  return parseGlobalOptions(command.optsWithGlobals()).flags;
}

async function resolveApi(flags: GlobalCliFlags) {
  const context = await loadAndResolveCliContext(flags);
  return { api: createHttpApiClientForHost(context.scope.host), context };
}

export function buildProgram(): Command {
  const program = attachGlobalOptions(new Command());
  program
    .name("insecur")
    .description("insecur CLI — metadata-only output; session handoff via env or subshell")
    .version("0.0.0");

  registerAuthCommands(program, { globalFlags, resolveApi });

  program
    .command("shell")
    .description("Start a subshell with INSECUR_SESSION_TOKEN in the environment")
    .argument("<profile>", "CLI profile slug or opaque id")
    .action(async function shellAction(profile: string, command: CommanderCommand) {
      const flags = globalFlags(command);
      const context = await loadAndResolveCliContext(flags);
      process.exitCode = await runShellCommand(flags, profile, context);
    });

  registerRunCommand(program, { globalFlags, resolveApi });

  program
    .command("init")
    .description("Provision guided organization defaults and write .insecur.json")
    .option("--profile-slug <slug>", "local CLI profile slug", DEFAULT_INIT_PROFILE_SLUG)
    .action(async function initAction(_args, command: CommanderCommand) {
      const flags = globalFlags(command);
      const options = command.opts<{ profileSlug: string }>();
      const { api, context } = await resolveApi(flags);
      process.exitCode = await runInitCommand(flags, api, context, {
        profileSlug: options.profileSlug,
      });
    });

  registerAuditCommands(program, globalFlags);
  registerSecretsCommands(program, { globalFlags, resolveApi });

  return program;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    const code = process.exitCode;
    return typeof code === "number" ? code : 0;
  } catch (error) {
    if (error instanceof CliError) {
      const flags = globalFlags(program);
      renderEnvelope(errorEnvelope(error.toErrorBody()), flags, () => "");
      return error.exitCode;
    }
    const flags = globalFlags(program);
    renderEnvelope(
      errorEnvelope({
        code: "cli.unexpected_error",
        message: error instanceof Error ? error.message : "Unexpected CLI failure",
        retryable: false,
      }),
      flags,
      () => "",
    );
    return EXIT_UNEXPECTED;
  }
}
