import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";
import { runScanCommand } from "../src/commands/scan.js";
import { EXIT_ACTION_REQUIRED } from "../src/output/exit-codes.js";
import { buildScanReport } from "../src/scan/report.js";
import {
  SENTINEL_DECOY_VALUE,
  SENTINEL_LOCAL_VALUE,
  SENTINEL_SECRET_VALUE,
  writeScanFixtureTree,
} from "./fixtures/scan-fixture.js";

describe("insecur scan", () => {
  let fixtureDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createFixture(): Promise<string> {
    fixtureDir = await mkdtemp(join(tmpdir(), "insecur-scan-fixture-"));
    await writeScanFixtureTree(fixtureDir);
    return fixtureDir;
  }

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

  it("reports correct counts and key names for a representative fixture tree", async () => {
    const root = await createFixture();
    const report = await buildScanReport({ rootDir: root });

    expect(report.summary.filesWithFindings).toBe(4);
    expect(report.summary.totalEntries).toBeGreaterThanOrEqual(6);
    expect(report.summary.likelySecrets).toBeGreaterThanOrEqual(3);
    expect(report.summary.migratableCount).toBeGreaterThanOrEqual(2);

    const keys = report.findings.map((finding) => finding.key).sort();
    expect(keys).toContain("API_SECRET");
    expect(keys).toContain("DATABASE_PASSWORD");
    expect(keys).toContain("private-key.pem");
    expect(keys).toContain("service-account.json");

    const dotenvFiles = report.findings
      .filter((finding) => finding.kind === "dotenv-entry")
      .map((finding) => finding.file);
    expect(dotenvFiles).toContain(".env");
    expect(dotenvFiles).toContain(".env.local");
  });

  it("finds gitignored .env files", async () => {
    const root = await createFixture();
    const report = await buildScanReport({ rootDir: root });
    const envFinding = report.findings.find(
      (finding) => finding.file === ".env" && finding.key === "API_SECRET",
    );
    expect(envFinding).toBeDefined();
  });

  it("never scans node_modules or .git decoys", async () => {
    const root = await createFixture();
    const report = await buildScanReport({ rootDir: root });
    const files = report.findings.map((finding) => finding.file);
    expect(files.some((file) => file.includes("node_modules"))).toBe(false);
    expect(files.some((file) => file.includes(".git"))).toBe(false);
    expect(report.findings.some((finding) => finding.key === "DECOY_API_SECRET")).toBe(false);
  });

  it("completes within a generous CI-safe time budget", async () => {
    const root = await createFixture();
    const report = await buildScanReport({ rootDir: root });
    expect(report.summary.elapsedMs).toBeLessThan(2000);
  });

  it("exits 0 by default even when findings exist", async () => {
    const root = await createFixture();
    const code = await runScanCommand({ ...baseFlags, configDir: root, quiet: true }, {});
    expect(code).toBe(0);
  });

  it("exits 7 under --strict when likely secrets exist", async () => {
    const root = await createFixture();
    const code = await runScanCommand(
      { ...baseFlags, configDir: root, quiet: true },
      { strict: true },
    );
    expect(code).toBe(EXIT_ACTION_REQUIRED);
  });

  it("exits 0 under --strict when the tree is clean", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-clean-"));
    const code = await runScanCommand(
      { ...baseFlags, configDir: root, quiet: true },
      { strict: true },
    );
    expect(code).toBe(0);
  });

  it("--strict --quiet emits exactly one stderr summary line and nothing on stdout", async () => {
    const root = await createFixture();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runScanCommand({ ...baseFlags, configDir: root, quiet: true }, { strict: true });

    expect(stdout.mock.calls).toHaveLength(0);
    expect(stderr.mock.calls).toHaveLength(1);
    const line = stderr.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    expect(line).toMatch(
      /^insecur scan: likely_secrets=\d+ files=\d+ migratable=\d+ elapsed_ms=\d+\n$/u,
    );
  });

  it("--json output passes metadata-only envelope shape", async () => {
    const root = await createFixture();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runScanCommand({ ...baseFlags, configDir: root, json: true }, {});

    const line = stdout.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    const parsed = JSON.parse(line as string) as Record<string, unknown>;
    assertMetadataOnlyEnvelopeShape(parsed);
    expect(parsed).toMatchObject({ ok: true });
    const data = parsed.data as Record<string, unknown>;
    expect(data.summary).toMatchObject({
      filesScanned: expect.any(Number),
      likelySecrets: expect.any(Number),
      elapsedMs: expect.any(Number),
    });
    const findings = data.findings as Record<string, unknown>[];
    expect(findings[0]).toMatchObject({
      file: expect.any(String),
      key: expect.any(String),
      kind: expect.any(String),
      confidence: expect.any(String),
      migratable: expect.any(Boolean),
    });

    stdout.mockRestore();
  });
});

describe("insecur scan no-reveal", () => {
  const sentinels = [SENTINEL_SECRET_VALUE, SENTINEL_LOCAL_VALUE, SENTINEL_DECOY_VALUE];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never prints sentinel values in human, JSON, or stderr output", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-noreveal-"));
    await writeScanFixtureTree(root);

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
      configDir: root,
      json: false,
      quiet: false,
      verbose: false,
    };

    await runScanCommand(flags, {});
    await runScanCommand({ ...flags, json: true }, {});
    await runScanCommand({ ...flags, quiet: true }, { strict: true });

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

  it("remediation strings route values via --value-stdin only", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-remediation-"));
    await writeScanFixtureTree(root);
    const report = await buildScanReport({ rootDir: root });
    const migratable = report.findings.filter((finding) => finding.migratable);
    expect(migratable.length).toBeGreaterThan(0);
    for (const finding of migratable) {
      expect(finding.remediation).toMatch(/^insecur secrets set [A-Z0-9_]+ --value-stdin$/u);
      expect(finding.remediation).not.toContain("=");
    }
  });
});
