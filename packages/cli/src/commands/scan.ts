import { resolve } from "node:path";
import type { GlobalCliFlags } from "../cli-options.js";
import {
  assertScanOutputFlagsCompatible,
  renderScanResult,
  resolveScanMode,
  runScan,
  scanStrictExitCode,
} from "../scan/runner.js";

export interface ScanCommandOptions {
  readonly strict?: boolean;
  readonly agentTranscripts?: boolean;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly homeDir?: string;
}

export async function runScanCommand(
  flags: GlobalCliFlags,
  commandOptions: ScanCommandOptions,
): Promise<number> {
  const strict = commandOptions.strict === true;
  assertScanOutputFlagsCompatible(flags, strict);

  const rootDir = resolve(flags.configDir ?? process.cwd());
  const mode = resolveScanMode(commandOptions);

  const result = await runScan({
    rootDir,
    mode,
    ...(mode === "agent-transcripts"
      ? {
          transcript: {
            ...(commandOptions.homeDir !== undefined ? { homeDir: commandOptions.homeDir } : {}),
            ...(commandOptions.transcriptPaths !== undefined
              ? { transcriptPaths: commandOptions.transcriptPaths }
              : {}),
            ...(commandOptions.transcriptGlobs !== undefined
              ? { transcriptGlobs: commandOptions.transcriptGlobs }
              : {}),
          },
        }
      : {}),
  });

  renderScanResult(result, flags, strict);
  return scanStrictExitCode(result, strict);
}
