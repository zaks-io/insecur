import { discoverProjectRoots } from "./project-roots.js";
import { scanProjectRoots } from "./project-scan.js";
import { collectPathsFromTranscripts } from "./transcript-paths.js";
import type { AgentProjectScanOptions, AgentProjectScanReport } from "./types.js";

export async function buildAgentProjectScanReport(
  options: AgentProjectScanOptions = {},
): Promise<AgentProjectScanReport> {
  const startedAt = performance.now();
  const collected = await collectPathsFromTranscripts(options);
  const projectRoots = await discoverProjectRoots(collected.paths);
  const projectReport = await scanProjectRoots(projectRoots);
  const warnings = [...collected.warnings];

  if (collected.paths.length > 0 && projectRoots.length === 0) {
    warnings.push({
      code: "agent_project.no_project_roots",
      message: "No readable project roots were resolved from agent transcript paths.",
    });
  }

  return {
    findings: projectReport.findings,
    warnings,
    projectRoots,
    summary: {
      transcriptsScanned: collected.transcriptsScanned,
      transcriptsUnreadable: collected.transcriptsUnreadable,
      transcriptsOversized: collected.transcriptsOversized,
      candidatePaths: collected.paths.length,
      projectsDiscovered: projectRoots.length,
      filesScanned: projectReport.summary.filesScanned,
      filesWithFindings: projectReport.summary.filesWithFindings,
      unreadableFiles: projectReport.summary.unreadableFiles,
      oversizedFiles: projectReport.summary.oversizedFiles,
      limitReached: collected.limitReached || projectReport.summary.limitReached,
      totalEntries: projectReport.summary.totalEntries,
      likelySecrets: projectReport.summary.likelySecrets,
      migratableCount: projectReport.summary.migratableCount,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
  };
}
