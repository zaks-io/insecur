import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";
import { runScanCommand } from "../src/commands/scan.js";
import { EXIT_ACTION_REQUIRED } from "../src/output/exit-codes.js";
import { buildTranscriptScanReport } from "../src/scan/transcripts/scanner.js";
import {
  SENTINEL_DECOY_VALUE,
  SENTINEL_LOCAL_VALUE,
  SENTINEL_SECRET_VALUE,
} from "./fixtures/scan-fixture.js";
import {
  SENTINEL_TRANSCRIPT_ONLY_VALUE,
  writeCustomTranscriptFixture,
  writeTranscriptScanFixtures,
} from "./fixtures/transcript-fixture.js";

describe("insecur scan --agent-transcripts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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

  it("flags exact project candidate matches in Cursor, Claude Code, and Codex fixtures", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-fixture-"));
    const layout = await writeTranscriptScanFixtures(root);

    const report = await buildTranscriptScanReport({
      rootDir: layout.projectRoot,
      homeDir: layout.homeDir,
    });

    expect(report.summary.transcriptsScanned).toBeGreaterThanOrEqual(3);
    expect(report.summary.confirmedCount).toBeGreaterThanOrEqual(2);
    expect(report.summary.heuristicCount).toBeGreaterThanOrEqual(1);

    const kinds = new Set(report.findings.map((finding) => finding.findingKind));
    expect(kinds.has("candidate_match")).toBe(true);
    expect(kinds.has("heuristic_transcript_secret")).toBe(true);

    const providers = new Set(report.findings.map((finding) => finding.provider));
    expect(providers.has("cursor")).toBe(true);
    expect(providers.has("claude-code")).toBe(true);
    expect(providers.has("codex")).toBe(true);

    const confirmedKeys = report.findings
      .filter((finding) => finding.findingKind === "candidate_match")
      .map((finding) => finding.candidateKey)
      .sort();
    expect(confirmedKeys).toContain("API_SECRET");
    expect(confirmedKeys).toContain("DATABASE_PASSWORD");
  });

  it("exits cleanly with metadata-only warnings when default discovery paths are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-missing-"));
    const homeDir = join(root, "empty-home");
    const report = await buildTranscriptScanReport({
      rootDir: root,
      homeDir,
    });

    expect(report.summary.transcriptsScanned).toBe(0);
    expect(report.warnings.length).toBeGreaterThanOrEqual(3);
    expect(report.warnings.every((warning) => warning.code.length > 0)).toBe(true);
    expect(report.warnings.every((warning) => !warning.message.includes("Error:"))).toBe(true);
  });

  it("scans explicit --transcript-path input", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-explicit-"));
    const layout = await writeTranscriptScanFixtures(root);
    const customPath = await writeCustomTranscriptFixture(
      root,
      "custom.jsonl",
      `value=${SENTINEL_SECRET_VALUE}`,
    );

    const report = await buildTranscriptScanReport({
      rootDir: layout.projectRoot,
      homeDir: layout.homeDir,
      transcriptPaths: [customPath],
    });

    expect(report.summary.transcriptsScanned).toBe(1);
    expect(report.findings.some((finding) => finding.sourcePath === customPath)).toBe(true);
  });

  it("runs transcript scan when --transcript-path is set without --agent-transcripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-path-only-"));
    const layout = await writeTranscriptScanFixtures(root);
    const customPath = await writeCustomTranscriptFixture(
      root,
      "path-only.jsonl",
      `value=${SENTINEL_SECRET_VALUE}`,
    );
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const code = await runScanCommand(
      { ...baseFlags, configDir: layout.projectRoot },
      {
        homeDir: layout.homeDir,
        transcriptPaths: [customPath],
      },
    );

    expect(code).toBe(0);
    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("transcript exposures");
    expect(output).not.toContain(SENTINEL_SECRET_VALUE);
    stdout.mockRestore();
  });

  it("exits 0 by default even when transcript exposures exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-exit-"));
    const layout = await writeTranscriptScanFixtures(root);
    const code = await runScanCommand(
      { ...baseFlags, configDir: layout.projectRoot, quiet: true },
      { agentTranscripts: true, homeDir: layout.homeDir },
    );
    expect(code).toBe(0);
  });

  it("exits 7 under --strict when transcript exposures exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-strict-"));
    const layout = await writeTranscriptScanFixtures(root);

    const report = await buildTranscriptScanReport({
      rootDir: layout.projectRoot,
      homeDir: layout.homeDir,
    });
    const transcriptPath = report.findings[0]?.sourcePath;
    expect(transcriptPath).toBeDefined();

    const code = await runScanCommand(
      { ...baseFlags, configDir: layout.projectRoot, quiet: true },
      {
        strict: true,
        agentTranscripts: true,
        homeDir: layout.homeDir,
        transcriptPaths: transcriptPath ? [transcriptPath] : [],
      },
    );
    expect(code).toBe(EXIT_ACTION_REQUIRED);
  });

  it("--json serialized envelope passes assertMetadataOnlyEnvelopeShape", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-json-"));
    const layout = await writeTranscriptScanFixtures(root);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runScanCommand(
      { ...baseFlags, configDir: layout.projectRoot, json: true },
      {
        agentTranscripts: true,
        homeDir: layout.homeDir,
      },
    );

    const line = stdout.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    const parsed: unknown = JSON.parse(line as string);
    assertMetadataOnlyEnvelopeShape(parsed as Record<string, unknown>);
    stdout.mockRestore();
  });
});

describe("insecur scan --agent-transcripts no-reveal", () => {
  const sentinels = [
    SENTINEL_SECRET_VALUE,
    SENTINEL_LOCAL_VALUE,
    SENTINEL_DECOY_VALUE,
    SENTINEL_TRANSCRIPT_ONLY_VALUE,
  ];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("never prints sentinel values in human, JSON, or stderr output", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-noreveal-"));
    const layout = await writeTranscriptScanFixtures(root);

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });

    const flags = {
      host: undefined,
      orgId: undefined,
      projectId: undefined,
      envId: undefined,
      profile: undefined,
      profileId: undefined,
      configDir: layout.projectRoot,
      json: false,
      quiet: false,
      verbose: false,
    };

    await runScanCommand(flags, { agentTranscripts: true, homeDir: layout.homeDir });
    await runScanCommand(
      { ...flags, json: true },
      { agentTranscripts: true, homeDir: layout.homeDir },
    );
    await runScanCommand(
      { ...flags, quiet: true },
      { agentTranscripts: true, strict: true, homeDir: layout.homeDir },
    );

    const allOutput = [...stdoutChunks, ...stderrChunks].join("");
    for (const sentinel of sentinels) {
      expect(allOutput).not.toContain(sentinel);
    }
    expect(allOutput).not.toMatch(/entropy/i);
    expect(allOutput).not.toMatch(/"value"/i);
    expect(allOutput).not.toMatch(/"line"/i);

    stdout.mockRestore();
    stderr.mockRestore();
  });
});
