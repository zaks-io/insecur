import { realpath } from "node:fs/promises";
import {
  listMachineScanTargets,
  resolveScanHomeDir,
  type MachineScanTarget,
} from "./machine-locations.js";
import { scanMachineTarget } from "./machine-scan-target.js";
import {
  listHomeDotenvTargets,
  listSshPrivateKeyTargets,
  resolvePathWithinHome,
} from "./machine-target-listing.js";
import type { ScanFinding, ScanReport } from "./types.js";

export interface MachineScanOptions {
  readonly homeDir?: string;
}

function emptyMachineSummary(startedAt: number): ScanReport["summary"] {
  return {
    filesScanned: 0,
    filesWithFindings: 0,
    unreadableFiles: [],
    oversizedFiles: [],
    limitReached: false,
    totalEntries: 0,
    likelySecrets: 0,
    migratableCount: 0,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

function applyScannedOutcome(
  outcome: Extract<Awaited<ReturnType<typeof scanMachineTarget>>, { status: "scanned" }>,
  state: {
    findings: ScanFinding[];
    filesWithFindings: Set<string>;
    totalEntries: { value: number };
  },
): void {
  state.totalEntries.value += outcome.entryCount;
  for (const finding of outcome.findings) {
    state.filesWithFindings.add(finding.file);
    state.findings.push(finding);
  }
}

async function processMachineTarget(
  target: MachineScanTarget,
  canonicalHome: string,
  state: {
    findings: ScanFinding[];
    unreadableFiles: string[];
    filesWithFindings: Set<string>;
    totalEntries: { value: number };
    filesScanned: { value: number };
  },
): Promise<void> {
  const resolved = await resolvePathWithinHome(target.absolutePath, canonicalHome);
  if (resolved.status === "missing") {
    return;
  }
  if (resolved.status === "unreadable") {
    state.unreadableFiles.push(target.displayPath);
    return;
  }

  const outcome = await scanMachineTarget({ ...target, absolutePath: resolved.path });
  if (outcome.status === "missing") {
    return;
  }
  if (outcome.status === "unreadable") {
    state.unreadableFiles.push(target.displayPath);
    return;
  }

  state.filesScanned.value += 1;
  applyScannedOutcome(outcome, state);
}

async function scanMachineTargets(
  homeDir: string,
  canonicalHome: string,
  state: {
    findings: ScanFinding[];
    unreadableFiles: string[];
    filesWithFindings: Set<string>;
    totalEntries: { value: number };
    filesScanned: { value: number };
  },
): Promise<void> {
  const fixedAndShellTargets = listMachineScanTargets(homeDir);
  const sshListing = await listSshPrivateKeyTargets(homeDir, canonicalHome);
  const dotenvListing = await listHomeDotenvTargets(homeDir, canonicalHome);

  if (sshListing.unreadable) {
    state.unreadableFiles.push("~/.ssh");
  }
  if (dotenvListing.unreadable) {
    state.unreadableFiles.push("~");
  }

  const allTargets = [...fixedAndShellTargets, ...sshListing.targets, ...dotenvListing.targets];

  for (const target of allTargets) {
    await processMachineTarget(target, canonicalHome, state);
  }
}

export async function buildMachineScanReport(
  options: MachineScanOptions,
): Promise<Pick<ScanReport, "findings" | "summary">> {
  const startedAt = performance.now();
  const homeDir = resolveScanHomeDir(options.homeDir);
  let canonicalHome: string;
  try {
    canonicalHome = await realpath(homeDir);
  } catch {
    return { findings: [], summary: emptyMachineSummary(startedAt) };
  }

  const state = {
    findings: [] as ScanFinding[],
    unreadableFiles: [] as string[],
    filesWithFindings: new Set<string>(),
    totalEntries: { value: 0 },
    filesScanned: { value: 0 },
  };

  await scanMachineTargets(homeDir, canonicalHome, state);

  const likelySecrets = state.findings.filter(
    (finding) => finding.confidence === "likely-secret",
  ).length;

  return {
    findings: state.findings,
    summary: {
      filesScanned: state.filesScanned.value,
      filesWithFindings: state.filesWithFindings.size,
      unreadableFiles: state.unreadableFiles,
      oversizedFiles: [],
      limitReached: false,
      totalEntries: state.totalEntries.value,
      likelySecrets,
      migratableCount: state.findings.filter((finding) => finding.migratable).length,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
  };
}
