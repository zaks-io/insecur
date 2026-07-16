import { successEnvelope, type NextAction } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { InsecurProjectConfig } from "../config/project-config.js";
import { adoptLocalProjectFromConfig } from "../local/adopt-local-project.js";
import {
  buildLocalValueReport,
  localValueSummary,
  LOCAL_MODE_MACHINE_SCOPED_LINE,
  type LocalValueReport,
} from "../local/local-value-report.js";
import { openLocalStore, type OpenLocalStoreOptions } from "../local/open-local-store.js";
import { renderSuccess } from "../output/render.js";

export interface LocalInitAdoptOptions {
  readonly store?: OpenLocalStoreOptions;
}

/**
 * `insecur init` re-run against an existing committed `"host": "local"` config:
 * adopt the committed project/environment IDs into this machine's store (a
 * silent no-op when already known) and report which manifest keys have values
 * on this machine. Never mints new IDs and never touches values.
 */
export async function runLocalInitAdoptCommand(
  flags: GlobalCliFlags,
  projectConfig: InsecurProjectConfig,
  commandOptions: LocalInitAdoptOptions = {},
): Promise<number> {
  const store = openLocalStore(commandOptions.store);
  try {
    const adoption = await adoptLocalProjectFromConfig({
      store,
      projectConfig,
      projectId: projectConfig.projectId,
      environmentId: projectConfig.defaultEnvId,
    });
    const report = await buildLocalValueReport(
      store,
      projectConfig.projectId,
      projectConfig.defaultEnvId,
    );
    renderLocalInitAdoptSuccess(flags, projectConfig, adoption.adoptedProject, report);
    return 0;
  } finally {
    store.close();
  }
}

function missingValueNextActions(report: LocalValueReport): readonly NextAction[] {
  return report.missingValues.map((missing) => ({
    id: `set-value:${missing.variableKey}`,
    actor: "agent",
    kind: "execute",
    argv: missing.secretsSet,
  }));
}

function renderLocalInitAdoptSuccess(
  flags: GlobalCliFlags,
  projectConfig: InsecurProjectConfig,
  adopted: boolean,
  report: LocalValueReport,
): void {
  const summary = localValueSummary(report);
  const envelope = successEnvelope(
    {
      projectId: projectConfig.projectId,
      environmentId: projectConfig.defaultEnvId,
      adopted,
      manifestKeyCount: report.manifestKeyCount,
      presentValueCount: report.presentValueCount,
      summary,
      machineScope: LOCAL_MODE_MACHINE_SCOPED_LINE,
      missingValues: report.missingValues,
    },
    undefined,
    missingValueNextActions(report),
  );
  renderSuccess(envelope, flags, () => formatHumanReport(projectConfig, adopted, report, summary));
}

function formatHumanReport(
  projectConfig: InsecurProjectConfig,
  adopted: boolean,
  report: LocalValueReport,
  summary: string,
): string {
  const heading = adopted
    ? `Adopted local project ${projectConfig.projectId} on this machine.`
    : `Local project ${projectConfig.projectId} is already set up on this machine.`;
  const lines = [heading, summary, LOCAL_MODE_MACHINE_SCOPED_LINE];
  for (const missing of report.missingValues) {
    lines.push(`  Set secret: ${missing.secretsSet.join(" ")}`);
  }
  return lines.join("\n");
}
