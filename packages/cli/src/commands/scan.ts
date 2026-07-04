import { resolve } from "node:path";
import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { EXIT_ACTION_REQUIRED } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import {
  buildScanReport,
  formatScanHumanReport,
  formatScanStrictQuietSummary,
} from "../scan/report.js";

export interface ScanCommandOptions {
  readonly strict?: boolean;
}

export async function runScanCommand(
  flags: GlobalCliFlags,
  commandOptions: ScanCommandOptions,
): Promise<number> {
  const rootDir = resolve(flags.configDir ?? process.cwd());
  const report = await buildScanReport({ rootDir });
  const strict = commandOptions.strict === true;

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
