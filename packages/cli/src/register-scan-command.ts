import type { Command, Command as CommanderCommand } from "commander";
import { runScanCommand } from "./commands/scan.js";
import type { GlobalCliFlags } from "./cli-options.js";

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
      "--agent-transcripts",
      "scan local agent conversation logs and transcript exports for secret exposure evidence",
    )
    .option(
      "--transcript-path <path>",
      "explicit transcript or log file to scan (repeatable)",
      collectRepeatedOption,
      [],
    )
    .option(
      "--transcript-glob <pattern>",
      "glob pattern for exported transcript files (repeatable)",
      collectRepeatedOption,
      [],
    )
    .action(async function scanAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        strict?: boolean;
        agentTranscripts?: boolean;
        transcriptPath?: string[];
        transcriptGlob?: string[];
      }>();
      process.exitCode = await runScanCommand(flags, {
        strict: options.strict === true,
        agentTranscripts: options.agentTranscripts === true,
        ...(options.transcriptPath !== undefined
          ? { transcriptPaths: options.transcriptPath }
          : {}),
        ...(options.transcriptGlob !== undefined
          ? { transcriptGlobs: options.transcriptGlob }
          : {}),
      });
    });
}

function collectRepeatedOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
