import { resolve } from "node:path";
import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_ACTION_REQUIRED, EXIT_VALIDATION } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import {
  buildScanReport,
  formatScanHumanReport,
  formatScanStrictQuietSummary,
} from "../scan/report.js";
import {
  formatTranscriptScanHumanReport,
  formatTranscriptScanStrictQuietSummary,
} from "../scan/transcripts/report.js";
import { buildTranscriptScanReport } from "../scan/transcripts/scanner.js";

export interface ScanCommandOptions {
  readonly strict?: boolean;
  readonly agentTranscripts?: boolean;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly homeDir?: string;
}

function assertScanOutputFlagsCompatible(flags: GlobalCliFlags, strict: boolean): void {
  if (strict && flags.quiet && flags.json) {
    throw new CliError(
      {
        code: "validation.invalid_command_input",
        message: "insecur scan --strict --quiet cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

function hasExplicitTranscriptInput(commandOptions: ScanCommandOptions): boolean {
  return (
    (commandOptions.transcriptPaths?.length ?? 0) > 0 ||
    (commandOptions.transcriptGlobs?.length ?? 0) > 0
  );
}

function shouldRunAgentTranscriptScan(commandOptions: ScanCommandOptions): boolean {
  return commandOptions.agentTranscripts === true || hasExplicitTranscriptInput(commandOptions);
}

export async function runScanCommand(
  flags: GlobalCliFlags,
  commandOptions: ScanCommandOptions,
): Promise<number> {
  const strict = commandOptions.strict === true;
  assertScanOutputFlagsCompatible(flags, strict);

  const rootDir = resolve(flags.configDir ?? process.cwd());

  if (shouldRunAgentTranscriptScan(commandOptions)) {
    return runAgentTranscriptScan(flags, commandOptions, rootDir, strict);
  }

  const report = await buildScanReport({ rootDir });

  if (strict && flags.quiet) {
    process.stderr.write(`${formatScanStrictQuietSummary(report)}\n`);
  } else {
    renderSuccess(
      successEnvelope({
        findings: report.findings,
        summary: report.summary,
      }),
      { json: flags.json, quiet: flags.quiet },
      () => formatScanHumanReport(report),
    );
  }

  if (strict && report.summary.likelySecrets > 0) {
    return EXIT_ACTION_REQUIRED;
  }

  return 0;
}

async function runAgentTranscriptScan(
  flags: GlobalCliFlags,
  commandOptions: ScanCommandOptions,
  rootDir: string,
  strict: boolean,
): Promise<number> {
  const report = await buildTranscriptScanReport({
    rootDir,
    ...(commandOptions.homeDir !== undefined ? { homeDir: commandOptions.homeDir } : {}),
    ...(commandOptions.transcriptPaths !== undefined
      ? { transcriptPaths: commandOptions.transcriptPaths }
      : {}),
    ...(commandOptions.transcriptGlobs !== undefined
      ? { transcriptGlobs: commandOptions.transcriptGlobs }
      : {}),
  });

  if (strict && flags.quiet) {
    process.stderr.write(`${formatTranscriptScanStrictQuietSummary(report)}\n`);
  } else {
    renderSuccess(
      successEnvelope({
        findings: report.findings,
        warnings: report.warnings,
        summary: report.summary,
      }),
      { json: flags.json, quiet: flags.quiet },
      () => formatTranscriptScanHumanReport(report),
    );
  }

  if (strict && report.summary.exposureCount > 0) {
    return EXIT_ACTION_REQUIRED;
  }

  return 0;
}
