import type { Command, Command as CommanderCommand } from "commander";
import { runScanCommand } from "./commands/scan.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { MACHINE_SCAN_HELP } from "./scan/machine-locations.js";

export function registerScanCommand(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  },
): void {
  program
    .command("scan")
    .description("Offline project-scoped secret exposure report (metadata only)")
    .option("--strict", "exit with code 7 when likely secrets or transcript exposures are found")
    .option(
      "--machine",
      "also scan documented well-known home-directory credential locations (read-only, opt-in)",
    )
    .option(
      "--agent-transcripts",
      "scan local agent conversation logs and transcript exports for secret exposure evidence",
    )
    .option(
      "--agent-projects",
      "discover agent-touched code directories from local conversations, then scan those projects",
    )
    .option(
      "--transcript-path <path>",
      "explicit transcript or log file to scan (repeatable)",
      collectRepeatedOption,
    )
    .option(
      "--transcript-glob <pattern>",
      "glob pattern for exported transcript files (repeatable)",
      collectRepeatedOption,
    )
    .addHelpText(
      "after",
      "\nThe global --config-dir flag sets the project scan root for this command (defaults to " +
        "the current working directory). Other commands use it only to locate .insecur.json.\n" +
        `\n${MACHINE_SCAN_HELP}\n`,
    )
    .action((...args) => runScanAction(deps, args));
}

async function runScanAction(
  deps: { readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags },
  args: unknown[],
): Promise<void> {
  const command = args.at(-1) as CommanderCommand;
  const flags = deps.globalFlags(command);
  const options = command.opts<{
    strict?: boolean;
    machine?: boolean;
    agentTranscripts?: boolean;
    agentProjects?: boolean;
    transcriptPath?: string[];
    transcriptGlob?: string[];
  }>();
  process.exitCode = await runScanCommand(flags, {
    strict: options.strict === true,
    machine: options.machine === true,
    agentTranscripts: options.agentTranscripts === true,
    agentProjects: options.agentProjects === true,
    ...(options.transcriptPath !== undefined ? { transcriptPaths: options.transcriptPath } : {}),
    ...(options.transcriptGlob !== undefined ? { transcriptGlobs: options.transcriptGlob } : {}),
  });
}

function collectRepeatedOption(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}
