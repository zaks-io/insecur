import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import {
  formatAgentProjectScanHumanReport,
  formatAgentProjectScanStrictQuietSummary,
} from "./agent-projects/report.js";
import { buildAgentProjectScanReport } from "./agent-projects/scanner.js";
import type { AgentProjectScanReport } from "./agent-projects/types.js";
import { buildScanReport, formatScanHumanReport, formatScanStrictQuietSummary } from "./report.js";
import {
  formatTranscriptScanHumanReport,
  formatTranscriptScanStrictQuietSummary,
} from "./transcripts/report.js";
import { buildTranscriptScanReport } from "./transcripts/scanner.js";
import type { ScanReport } from "./types.js";
import type { TranscriptScanReport } from "./transcripts/types.js";

export { scanStrictExitCode } from "./scan-strict.js";

/** Scan modes supported by the shared runner. */
export type ScanMode = "project" | "agent-transcripts" | "agent-projects";

export interface ScanModeSelectionInput {
  readonly machine?: boolean;
  readonly agentTranscripts?: boolean;
  readonly agentProjects?: boolean;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
}

export interface ScanRunInput {
  readonly rootDir: string;
  readonly mode: ScanMode;
  readonly machine?: boolean;
  readonly homeDir?: string;
  readonly transcript?: {
    readonly homeDir?: string;
    readonly transcriptPaths?: readonly string[];
    readonly transcriptGlobs?: readonly string[];
  };
  readonly agentProjects?: {
    readonly homeDir?: string;
    readonly transcriptPaths?: readonly string[];
    readonly transcriptGlobs?: readonly string[];
  };
}

/** Unified scan result at the command seam; mode-specific reports stay internal. */
export type ScanRunResult =
  | { readonly mode: "project"; readonly report: ScanReport }
  | { readonly mode: "agent-transcripts"; readonly report: TranscriptScanReport }
  | { readonly mode: "agent-projects"; readonly report: AgentProjectScanReport };

function hasExplicitTranscriptInput(input: ScanModeSelectionInput): boolean {
  return (input.transcriptPaths?.length ?? 0) > 0 || (input.transcriptGlobs?.length ?? 0) > 0;
}

export function resolveScanMode(input: ScanModeSelectionInput): ScanMode {
  if (input.agentProjects === true) {
    return "agent-projects";
  }
  if (input.agentTranscripts === true || hasExplicitTranscriptInput(input)) {
    return "agent-transcripts";
  }
  return "project";
}

export function assertScanOutputFlagsCompatible(flags: GlobalCliFlags, strict: boolean): void {
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

export function assertScanModeFlagsCompatible(input: ScanModeSelectionInput): void {
  if (input.agentProjects === true && input.agentTranscripts === true) {
    throw new CliError(
      {
        code: "validation.invalid_command_input",
        message:
          "insecur scan cannot combine --agent-projects with --agent-transcripts. Run them separately.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  if (
    input.machine === true &&
    (input.agentProjects === true ||
      input.agentTranscripts === true ||
      hasExplicitTranscriptInput(input))
  ) {
    throw new CliError(
      {
        code: "validation.invalid_command_input",
        message:
          "insecur scan --machine can only be used with the default project scan. Run it separately from agent scans.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

async function runProjectScan(
  rootDir: string,
  machine?: boolean,
  homeDir?: string,
): Promise<ScanRunResult> {
  return {
    mode: "project",
    report: await buildScanReport({
      rootDir,
      ...(machine === true ? { machine: true } : {}),
      ...(homeDir !== undefined ? { homeDir } : {}),
    }),
  };
}

async function runAgentTranscriptScan(
  rootDir: string,
  transcript: NonNullable<ScanRunInput["transcript"]>,
): Promise<ScanRunResult> {
  return {
    mode: "agent-transcripts",
    report: await buildTranscriptScanReport({
      rootDir,
      ...(transcript.homeDir !== undefined ? { homeDir: transcript.homeDir } : {}),
      ...(transcript.transcriptPaths !== undefined
        ? { transcriptPaths: transcript.transcriptPaths }
        : {}),
      ...(transcript.transcriptGlobs !== undefined
        ? { transcriptGlobs: transcript.transcriptGlobs }
        : {}),
    }),
  };
}

async function runAgentProjectScan(
  agentProjects: NonNullable<ScanRunInput["agentProjects"]>,
): Promise<ScanRunResult> {
  return {
    mode: "agent-projects",
    report: await buildAgentProjectScanReport({
      ...(agentProjects.homeDir !== undefined ? { homeDir: agentProjects.homeDir } : {}),
      ...(agentProjects.transcriptPaths !== undefined
        ? { transcriptPaths: agentProjects.transcriptPaths }
        : {}),
      ...(agentProjects.transcriptGlobs !== undefined
        ? { transcriptGlobs: agentProjects.transcriptGlobs }
        : {}),
    }),
  };
}

export async function runScan(input: ScanRunInput): Promise<ScanRunResult> {
  if (input.mode === "agent-projects") {
    return runAgentProjectScan(input.agentProjects ?? {});
  }
  if (input.mode === "agent-transcripts") {
    return runAgentTranscriptScan(input.rootDir, input.transcript ?? {});
  }
  return runProjectScan(input.rootDir, input.machine, input.homeDir);
}

function formatStrictQuietSummary(result: ScanRunResult): string {
  if (result.mode === "project") {
    return formatScanStrictQuietSummary(result.report);
  }
  if (result.mode === "agent-projects") {
    return formatAgentProjectScanStrictQuietSummary(result.report);
  }
  return formatTranscriptScanStrictQuietSummary(result.report);
}

function formatHumanReport(result: ScanRunResult): string {
  if (result.mode === "project") {
    return formatScanHumanReport(result.report);
  }
  if (result.mode === "agent-projects") {
    return formatAgentProjectScanHumanReport(result.report);
  }
  return formatTranscriptScanHumanReport(result.report);
}

export function renderScanResult(
  result: ScanRunResult,
  flags: Pick<GlobalCliFlags, "json" | "quiet">,
  strict: boolean,
): void {
  if (strict && flags.quiet) {
    process.stderr.write(`${formatStrictQuietSummary(result)}\n`);
    return;
  }

  if (result.mode === "project") {
    renderSuccess(
      successEnvelope({
        findings: result.report.findings,
        summary: result.report.summary,
      }),
      { json: flags.json, quiet: flags.quiet },
      () => formatHumanReport(result),
    );
    return;
  }

  if (result.mode === "agent-projects") {
    renderSuccess(
      successEnvelope({
        findings: result.report.findings,
        projectRoots: result.report.projectRoots,
        warnings: result.report.warnings,
        summary: result.report.summary,
      }),
      { json: flags.json, quiet: flags.quiet },
      () => formatHumanReport(result),
    );
    return;
  }

  renderSuccess(
    successEnvelope({
      findings: result.report.findings,
      warnings: result.report.warnings,
      summary: result.report.summary,
    }),
    { json: flags.json, quiet: flags.quiet },
    () => formatHumanReport(result),
  );
}
