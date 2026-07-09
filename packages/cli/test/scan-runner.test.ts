import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_ACTION_REQUIRED } from "../src/output/exit-codes.js";
import {
  assertScanModeFlagsCompatible,
  renderScanResult,
  resolveScanMode,
  runScan,
  scanStrictExitCode,
} from "../src/scan/runner.js";
import { writeScanFixtureTree } from "./fixtures/scan-fixture.js";
import { writeTranscriptScanFixtures } from "./fixtures/transcript-fixture.js";

describe("shared scan runner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves project mode by default", () => {
    expect(resolveScanMode({})).toBe("project");
  });

  it("resolves agent-transcripts mode from flags and explicit paths", () => {
    expect(resolveScanMode({ agentTranscripts: true })).toBe("agent-transcripts");
    expect(resolveScanMode({ transcriptPaths: ["/tmp/example.jsonl"] })).toBe("agent-transcripts");
    expect(resolveScanMode({ transcriptGlobs: ["**/*.jsonl"] })).toBe("agent-transcripts");
  });

  it("resolves agent-project mode separately from transcript exposure mode", () => {
    expect(resolveScanMode({ agentProjects: true })).toBe("agent-projects");
    expect(() =>
      assertScanModeFlagsCompatible({ agentProjects: true, agentTranscripts: true }),
    ).toThrow(/cannot combine/u);
    expect(() => assertScanModeFlagsCompatible({ agentProjects: true, machine: true })).toThrow(
      /default project scan/u,
    );
    expect(() =>
      assertScanModeFlagsCompatible({ machine: true, transcriptPaths: ["agent.jsonl"] }),
    ).toThrow(/default project scan/u);
  });

  it("runs project scan through the shared runner with the project report shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-runner-project-"));
    await writeScanFixtureTree(root);

    const result = await runScan({ rootDir: root, mode: "project" });

    expect(result.mode).toBe("project");
    expect(result.report.summary.filesWithFindings).toBeGreaterThan(0);
    expect(result.report.findings.length).toBeGreaterThan(0);
    expect("warnings" in result.report).toBe(false);
  });

  it("runs agent-transcript scan through the shared runner with the transcript report shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-runner-transcript-"));
    const layout = await writeTranscriptScanFixtures(root);

    const result = await runScan({
      rootDir: layout.projectRoot,
      mode: "agent-transcripts",
      transcript: { homeDir: layout.homeDir },
    });

    expect(result.mode).toBe("agent-transcripts");
    expect(result.report.summary.exposureCount).toBeGreaterThan(0);
    expect(result.report.warnings).toBeDefined();
    expect(result.report.findings.length).toBeGreaterThan(0);
  });

  it("applies strict exit behavior for project and transcript results", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "insecur-runner-strict-project-"));
    await writeScanFixtureTree(projectRoot);
    const projectResult = await runScan({ rootDir: projectRoot, mode: "project" });

    expect(scanStrictExitCode(projectResult, false)).toBe(0);
    expect(scanStrictExitCode(projectResult, true)).toBe(EXIT_ACTION_REQUIRED);

    const transcriptRoot = await mkdtemp(join(tmpdir(), "insecur-runner-strict-transcript-"));
    const layout = await writeTranscriptScanFixtures(transcriptRoot);
    const transcriptResult = await runScan({
      rootDir: layout.projectRoot,
      mode: "agent-transcripts",
      transcript: { homeDir: layout.homeDir },
    });

    expect(scanStrictExitCode(transcriptResult, false)).toBe(0);
    expect(scanStrictExitCode(transcriptResult, true)).toBe(EXIT_ACTION_REQUIRED);

    const agentProjectResult = await runScan({
      rootDir: layout.projectRoot,
      mode: "agent-projects",
      agentProjects: { homeDir: layout.homeDir },
    });

    expect(scanStrictExitCode(agentProjectResult, false)).toBe(0);
    expect(scanStrictExitCode(agentProjectResult, true)).toBe(0);
  });

  it("renders project and transcript strict-quiet summaries through one path", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "insecur-runner-render-project-"));
    await writeScanFixtureTree(projectRoot);
    const projectResult = await runScan({ rootDir: projectRoot, mode: "project" });

    const transcriptRoot = await mkdtemp(join(tmpdir(), "insecur-runner-render-transcript-"));
    const layout = await writeTranscriptScanFixtures(transcriptRoot);
    const transcriptResult = await runScan({
      rootDir: layout.projectRoot,
      mode: "agent-transcripts",
      transcript: { homeDir: layout.homeDir },
    });

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    renderScanResult(projectResult, { json: false, quiet: true }, true);
    const projectLine = String(stderr.mock.calls[0]?.[0] ?? "");
    expect(projectLine).toMatch(/^insecur scan: likely_secrets=/u);

    stderr.mockClear();
    renderScanResult(transcriptResult, { json: false, quiet: true }, true);
    const transcriptLine = String(stderr.mock.calls[0]?.[0] ?? "");
    expect(transcriptLine).toMatch(/^insecur scan --agent-transcripts: exposures=/u);

    stderr.mockClear();
    const agentProjectResult = await runScan({
      rootDir: layout.projectRoot,
      mode: "agent-projects",
      agentProjects: { homeDir: layout.homeDir },
    });
    renderScanResult(agentProjectResult, { json: false, quiet: true }, true);
    const agentProjectLine = String(stderr.mock.calls[0]?.[0] ?? "");
    expect(agentProjectLine).toMatch(/^insecur scan --agent-projects: likely_secrets=/u);

    stderr.mockRestore();
  });
});
