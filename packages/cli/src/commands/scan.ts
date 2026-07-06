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

export interface ScanCommandOptions {
  readonly strict?: boolean;
}

function assertScanOutputFlagsCompatible(flags: GlobalCliFlags, strict: boolean): void {
  if (strict && flags.quiet && flags.json) {
    throw new CliError(
      {
        code: "cli.validation_error",
        message: "insecur scan --strict --quiet cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

export async function runScanCommand(
  flags: GlobalCliFlags,
  commandOptions: ScanCommandOptions,
): Promise<number> {
  const strict = commandOptions.strict === true;
  assertScanOutputFlagsCompatible(flags, strict);

  const rootDir = resolve(flags.configDir ?? process.cwd());
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
