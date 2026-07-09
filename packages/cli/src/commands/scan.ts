import { resolve } from "node:path";
import type { GlobalCliFlags } from "../cli-options.js";
import {
  assertScanModeFlagsCompatible,
  assertScanOutputFlagsCompatible,
  renderScanResult,
  resolveScanMode,
  runScan,
  scanStrictExitCode,
  type ScanMode,
  type ScanRunInput,
} from "../scan/runner.js";

export interface ScanCommandOptions {
  readonly strict?: boolean;
  readonly machine?: boolean;
  readonly agentTranscripts?: boolean;
  readonly agentProjects?: boolean;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly homeDir?: string;
}

interface MutableTranscriptScanOptions {
  homeDir?: string;
  transcriptPaths?: readonly string[];
  transcriptGlobs?: readonly string[];
}

function transcriptScanOptions(
  commandOptions: ScanCommandOptions,
): NonNullable<ScanRunInput["transcript"]> {
  const transcript: MutableTranscriptScanOptions = {};
  if (commandOptions.homeDir !== undefined) {
    transcript.homeDir = commandOptions.homeDir;
  }
  if (commandOptions.transcriptPaths !== undefined) {
    transcript.transcriptPaths = commandOptions.transcriptPaths;
  }
  if (commandOptions.transcriptGlobs !== undefined) {
    transcript.transcriptGlobs = commandOptions.transcriptGlobs;
  }
  return transcript;
}

function projectScanInput(rootDir: string, commandOptions: ScanCommandOptions): ScanRunInput {
  return {
    rootDir,
    mode: "project",
    ...(commandOptions.machine === true ? { machine: true } : {}),
    ...(commandOptions.homeDir !== undefined ? { homeDir: commandOptions.homeDir } : {}),
  };
}

function scanRunInput(
  rootDir: string,
  mode: ScanMode,
  commandOptions: ScanCommandOptions,
): ScanRunInput {
  if (mode === "agent-transcripts") {
    return { rootDir, mode, transcript: transcriptScanOptions(commandOptions) };
  }
  if (mode === "agent-projects") {
    return { rootDir, mode, agentProjects: transcriptScanOptions(commandOptions) };
  }
  return projectScanInput(rootDir, commandOptions);
}

export async function runScanCommand(
  flags: GlobalCliFlags,
  commandOptions: ScanCommandOptions,
): Promise<number> {
  const strict = commandOptions.strict === true;
  assertScanOutputFlagsCompatible(flags, strict);
  assertScanModeFlagsCompatible(commandOptions);

  const rootDir = resolve(flags.configDir ?? process.cwd());
  const mode = resolveScanMode(commandOptions);

  const result = await runScan(scanRunInput(rootDir, mode, commandOptions));

  renderScanResult(result, flags, strict);
  return scanStrictExitCode(result, strict);
}
