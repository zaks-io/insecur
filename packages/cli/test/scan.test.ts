import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
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

  const chmodDenyReadIsMeaningful = process.platform !== "win32" && process.getuid?.() !== 0;
  const unreadablePermissionIt = chmodDenyReadIsMeaningful ? it : it.skip;
  const symlinkIt = process.platform === "win32" ? it.skip : it;

  async function tryCreateSymlink(target: string, linkPath: string): Promise<boolean> {
    try {
      await symlink(target, linkPath);
      return true;
    } catch {
      return false;
    }
  }

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
    expect(report.summary.limitReached).toBe(false);

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
      /^insecur scan: likely_secrets=\d+ files=\d+ migratable=\d+ unreadable=\d+ oversized=\d+ limit_reached=[01] elapsed_ms=\d+\n$/u,
    );
  });

  it("rejects --json with --strict --quiet", async () => {
    const root = await createFixture();
    await expect(
      runScanCommand({ ...baseFlags, configDir: root, json: true, quiet: true }, { strict: true }),
    ).rejects.toMatchObject({
      message: "insecur scan --strict --quiet cannot be combined with --json.",
    });
  });

  it("--json serialized envelope passes assertMetadataOnlyEnvelopeShape", async () => {
    const root = await createFixture();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runScanCommand({ ...baseFlags, configDir: root, json: true }, {});

    const line = stdout.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    const parsed: unknown = JSON.parse(line as string);
    assertMetadataOnlyEnvelopeShape(parsed as Record<string, unknown>);

    stdout.mockRestore();
  });

  unreadablePermissionIt("reports unreadable secret-path candidates in the summary", async () => {
    const root = await createFixture();
    const npmrcPath = join(root, ".npmrc");
    await writeFile(npmrcPath, "registry=https://registry.npmjs.org/\n", "utf8");
    await chmod(npmrcPath, 0o000);

    try {
      const report = await buildScanReport({ rootDir: root });
      expect(report.summary.unreadableFiles).toContain(".npmrc");
    } finally {
      await chmod(npmrcPath, 0o644);
    }
  });

  unreadablePermissionIt("reports unreadable directories in the summary", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-walker-dir-"));
    const secretsDir = join(root, "secrets");
    await mkdir(secretsDir);
    await writeFile(join(secretsDir, ".env"), "API_SECRET=sentinel-metadata-only\n", "utf8");
    await chmod(secretsDir, 0o000);

    try {
      const report = await buildScanReport({ rootDir: root });
      expect(report.summary.unreadableFiles).toContain("secrets");
    } finally {
      await chmod(secretsDir, 0o755);
    }
  });

  symlinkIt("follows symlinks to secret files and reports broken symlinks", async ({ skip }) => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-symlink-"));
    await writeFile(join(root, "target.env"), "API_KEY=sentinel-metadata-only\n", "utf8");
    if (!(await tryCreateSymlink("target.env", join(root, ".env")))) {
      skip();
      return;
    }
    if (!(await tryCreateSymlink("missing-target.env", join(root, "broken.link")))) {
      skip();
      return;
    }

    const report = await buildScanReport({ rootDir: root });
    expect(report.findings.some((finding) => finding.file === ".env")).toBe(true);
    expect(report.summary.unreadableFiles).toContain("broken.link");
  });

  symlinkIt("does not follow symlinks that escape the scan root", async ({ skip }) => {
    const outer = await mkdtemp(join(tmpdir(), "insecur-scan-outer-"));
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-root-"));
    await writeFile(join(outer, "escaped.env"), "API_KEY=sentinel-metadata-only\n", "utf8");
    if (!(await tryCreateSymlink(join(outer, "escaped.env"), join(root, "escape.link")))) {
      skip();
      return;
    }

    const report = await buildScanReport({ rootDir: root });
    expect(report.findings.some((finding) => finding.file === "escape.link")).toBe(false);
    expect(report.summary.unreadableFiles).toContain("escape.link");
  });

  it("reports limitReached when maxFiles stops the walk early", async () => {
    const root = await createFixture();
    const report = await buildScanReport({ rootDir: root, maxFiles: 1 });

    expect(report.summary.limitReached).toBe(true);
    expect(report.summary.filesScanned).toBe(1);
  });

  it("detects auth-token files when _authToken appears after the former head slice", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-auth-token-"));
    const padding = "x".repeat(600);
    await writeFile(
      join(root, ".npmrc"),
      `${padding}\n_authToken=sentinel-metadata-only\n`,
      "utf8",
    );

    const report = await buildScanReport({ rootDir: root });
    expect(report.findings.some((finding) => finding.file === ".npmrc")).toBe(true);
  });

  it("reports oversized files in the summary", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-oversized-"));
    await writeFile(join(root, ".npmrc"), "x".repeat(300), "utf8");

    const report = await buildScanReport({ rootDir: root, maxFileBytes: 256 });
    expect(report.summary.oversizedFiles).toContain(".npmrc");
  });

  it("detects extensionless private-key files via PEM content fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-scan-ext-key-"));
    const border = "-".repeat(5);
    const body = [
      `${border}BEGIN PRIVATE KEY${border}`,
      "SENTINEL_EXTENSIONLESS_KEY_METADATA_ONLY",
      `${border}END PRIVATE KEY${border}`,
      "",
    ].join("\n");
    await writeFile(join(root, "id_rsa"), body, "utf8");

    const report = await buildScanReport({ rootDir: root });
    const finding = report.findings.find(
      (candidate) => candidate.file === "id_rsa" && candidate.kind === "private-key-file",
    );
    expect(finding).toBeDefined();
    expect(finding?.confidence).toBe("likely-secret");
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
