import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";
import { runScanCommand } from "../src/commands/scan.js";
import { EXIT_ACTION_REQUIRED, EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { buildAgentProjectScanReport } from "../src/scan/agent-projects/scanner.js";
import {
  SENTINEL_DECOY_VALUE,
  SENTINEL_SECRET_VALUE,
  writeScanFixtureTree,
} from "./fixtures/scan-fixture.js";

const baseFlags = {
  host: undefined,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined as string | undefined,
  json: false,
  quiet: false,
  verbose: false,
};

async function writeCodexTranscript(homeDir: string, content: string): Promise<string> {
  const transcriptDir = join(homeDir, ".codex", "sessions", "2026", "07", "08");
  await mkdir(transcriptDir, { recursive: true });
  const transcriptPath = join(
    transcriptDir,
    "rollout-2026-07-08T10-00-00-44444444-4444-4444-8444-444444444444.jsonl",
  );
  await writeFile(
    transcriptPath,
    JSON.stringify({
      type: "turn_context",
      payload: { cwd: content },
    }),
    "utf8",
  );
  return transcriptPath;
}

async function writeClaudeTranscriptForProject(
  homeDir: string,
  projectDir: string,
): Promise<string> {
  const encodedProject = projectDir.replaceAll("/", "-");
  const transcriptDir = join(homeDir, ".claude", "projects", encodedProject);
  await mkdir(transcriptDir, { recursive: true });
  const transcriptPath = join(transcriptDir, "55555555-5555-4555-8555-555555555555.jsonl");
  await writeFile(transcriptPath, JSON.stringify({ type: "summary", summary: "work" }), "utf8");
  return transcriptPath;
}

describe("insecur scan --agent-projects", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers agent-touched projects from transcripts and scans only those roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-agent-projects-"));
    const homeDir = join(root, "home");
    const mentionedProject = join(root, "mentioned-project");
    const unrelatedProject = join(root, "unrelated-project");
    await mkdir(mentionedProject, { recursive: true });
    await mkdir(unrelatedProject, { recursive: true });
    await writeScanFixtureTree(mentionedProject);
    await writeFile(join(unrelatedProject, "package.json"), "{}", "utf8");
    await writeFile(join(unrelatedProject, ".env"), `DECOY=${SENTINEL_DECOY_VALUE}\n`, "utf8");
    await writeCodexTranscript(homeDir, mentionedProject);

    const report = await buildAgentProjectScanReport({ homeDir });

    expect(report.summary.projectsDiscovered).toBe(1);
    expect(report.projectRoots).toEqual([mentionedProject]);
    expect(report.findings.some((finding) => finding.file === join(mentionedProject, ".env"))).toBe(
      true,
    );
    expect(report.findings.some((finding) => finding.file.includes("unrelated-project"))).toBe(
      false,
    );
    for (const finding of report.findings) {
      expect(finding.file).not.toContain(SENTINEL_SECRET_VALUE);
      expect(finding.file).not.toContain(SENTINEL_DECOY_VALUE);
    }
  });

  it("serializes metadata-only JSON output and never prints secret values", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-agent-projects-json-"));
    const homeDir = join(root, "home");
    const mentionedProject = join(root, "mentioned-project");
    await mkdir(mentionedProject, { recursive: true });
    await writeScanFixtureTree(mentionedProject);
    await writeCodexTranscript(homeDir, mentionedProject);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runScanCommand({ ...baseFlags, json: true }, { agentProjects: true, homeDir });

    const output = String(stdout.mock.calls[0]?.[0] ?? "");
    expect(output).not.toContain(SENTINEL_SECRET_VALUE);
    const parsed: unknown = JSON.parse(output);
    assertMetadataOnlyEnvelopeShape(parsed as Record<string, unknown>);
    stdout.mockRestore();
  });

  it("resolves Claude project-directory metadata even when path segments contain hyphens", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-agent-projects-claude-"));
    const homeDir = join(root, "home");
    const projectDir = join(root, "zaks-io-business");
    await mkdir(projectDir, { recursive: true });
    await writeScanFixtureTree(projectDir);
    await writeClaudeTranscriptForProject(homeDir, projectDir);

    const report = await buildAgentProjectScanReport({ homeDir });

    expect(report.projectRoots).toEqual([projectDir]);
    expect(report.findings.some((finding) => finding.file === join(projectDir, ".env"))).toBe(true);
  });

  it("exits 7 under --strict when agent-touched projects contain likely secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-agent-projects-strict-"));
    const homeDir = join(root, "home");
    const mentionedProject = join(root, "mentioned-project");
    await mkdir(mentionedProject, { recursive: true });
    await writeScanFixtureTree(mentionedProject);
    await writeCodexTranscript(homeDir, mentionedProject);

    const code = await runScanCommand(
      { ...baseFlags, quiet: true },
      { strict: true, agentProjects: true, homeDir },
    );

    expect(code).toBe(EXIT_ACTION_REQUIRED);
  });

  it("rejects combining transcript exposure and agent-project inventory scans", async () => {
    await expect(
      runScanCommand(baseFlags, { agentProjects: true, agentTranscripts: true }),
    ).rejects.toMatchObject({ exitCode: EXIT_VALIDATION });
  });
});
