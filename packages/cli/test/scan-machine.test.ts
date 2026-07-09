import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";
import { runScanCommand } from "../src/commands/scan.js";
import { EXIT_ACTION_REQUIRED } from "../src/output/exit-codes.js";
import { buildScanReport } from "../src/scan/report.js";
import {
  MACHINE_SCAN_ALLOWLIST_LINES,
  MACHINE_SCAN_FIXED_FILES,
  MACHINE_SCAN_SHELL_RC_FILES,
} from "../src/scan/machine-locations.js";
import {
  MACHINE_SENTINEL_EXPORT_VALUE,
  MACHINE_SENTINEL_SECRET_VALUE,
  writeMachineScanFixtureHome,
} from "./fixtures/scan-machine-fixture.js";
import { writeScanFixtureTree } from "./fixtures/scan-fixture.js";
import {
  SENTINEL_DECOY_VALUE,
  SENTINEL_LOCAL_VALUE,
  SENTINEL_SECRET_VALUE,
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

describe("insecur scan --machine", () => {
  let projectDir: string;
  let homeDir: string;

  const symlinkIt = process.platform === "win32" ? it.skip : it;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createFixture(): Promise<{ projectDir: string; homeDir: string }> {
    projectDir = await mkdtemp(join(tmpdir(), "insecur-scan-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "insecur-scan-home-"));
    await writeScanFixtureTree(projectDir);
    await writeMachineScanFixtureHome(homeDir);
    return { projectDir, homeDir };
  }

  it("without --machine never reads paths outside the project tree", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const report = await buildScanReport({ rootDir: root, homeDir: home });

    const machinePaths = report.findings.filter((finding) => finding.scope === "machine");
    expect(machinePaths).toHaveLength(0);
    expect(report.summary.machine).toBeUndefined();

    for (const finding of report.findings) {
      expect(finding.scope).toBe("project");
      expect(finding.file).not.toMatch(/^~\//u);
    }
  });

  it("scans exactly the documented allowlist and groups project + machine findings", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const report = await buildScanReport({ rootDir: root, machine: true, homeDir: home });

    const projectFindings = report.findings.filter((finding) => finding.scope === "project");
    const machineFindings = report.findings.filter((finding) => finding.scope === "machine");

    expect(projectFindings.length).toBeGreaterThan(0);
    expect(machineFindings.length).toBeGreaterThan(0);
    expect(report.summary.project).toBeDefined();
    expect(report.summary.machine).toBeDefined();
    expect(report.summary.likelySecrets).toBe(
      (report.summary.project?.likelySecrets ?? 0) + (report.summary.machine?.likelySecrets ?? 0),
    );

    const machineFiles = machineFindings.map((finding) => finding.file).sort();
    expect(machineFiles).toContain("~/.aws/credentials");
    expect(machineFiles).toContain("~/.netrc");
    expect(machineFiles).toContain("~/.npmrc");
    expect(machineFiles).toContain("~/.docker/config.json");
    expect(machineFiles).toContain("~/.ssh/id_ed25519");
    expect(machineFiles).toContain("~/.env");
    expect(machineFiles.some((file) => file === "~/.zshrc")).toBe(true);
    expect(machineFiles.some((file) => file.endsWith(".pub"))).toBe(false);
  });

  it("reports shell rc export key names only with migratable remediation", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const report = await buildScanReport({ rootDir: root, machine: true, homeDir: home });
    const shellFinding = report.findings.find(
      (finding) => finding.file === "~/.zshrc" && finding.key === "API_TOKEN",
    );
    expect(shellFinding).toBeDefined();
    expect(shellFinding?.migratable).toBe(true);
    expect(shellFinding?.remediation).toBe("insecur secrets set API_TOKEN --value-stdin");
  });

  it("marks AWS credentials and SSH keys as not migratable", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const report = await buildScanReport({ rootDir: root, machine: true, homeDir: home });

    const awsFinding = report.findings.find((finding) => finding.file === "~/.aws/credentials");
    expect(awsFinding?.migratable).toBe(false);
    expect(awsFinding?.reason).toContain("AWS");

    const sshFinding = report.findings.find((finding) => finding.file === "~/.ssh/id_ed25519");
    expect(sshFinding?.migratable).toBe(false);
  });

  it("exits 7 under --machine --strict when findings exist", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const code = await runScanCommand(
      { ...baseFlags, configDir: root, quiet: true },
      { strict: true, machine: true, homeDir: home },
    );
    expect(code).toBe(EXIT_ACTION_REQUIRED);
  });

  it("--machine --strict --quiet includes project and machine counts on stderr", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runScanCommand(
      { ...baseFlags, configDir: root, quiet: true },
      { strict: true, machine: true, homeDir: home },
    );

    expect(stdout.mock.calls).toHaveLength(0);
    expect(stderr.mock.calls).toHaveLength(1);
    const line = String(stderr.mock.calls[0]?.[0] ?? "");
    expect(line).toMatch(/project_likely_secrets=\d+/u);
    expect(line).toMatch(/machine_likely_secrets=\d+/u);

    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("--machine --json passes metadata-only envelope checks", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runScanCommand(
      { ...baseFlags, configDir: root, json: true },
      { machine: true, homeDir: home },
    );

    const line = stdout.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    const parsed: unknown = JSON.parse(line as string);
    assertMetadataOnlyEnvelopeShape(parsed as Record<string, unknown>);

    stdout.mockRestore();
  });

  symlinkIt("does not follow symlinks that escape the home directory", async ({ skip }) => {
    const outer = await mkdtemp(join(tmpdir(), "insecur-machine-outer-"));
    const home = await mkdtemp(join(tmpdir(), "insecur-machine-home-"));
    await mkdir(join(home, ".ssh"));
    await writeFile(
      join(outer, "escaped.pem"),
      "-----BEGIN PRIVATE KEY-----\nSENTINEL\n-----END PRIVATE KEY-----\n",
      "utf8",
    );

    try {
      await symlink(join(outer, "escaped.pem"), join(home, ".ssh", "escape-link"));
    } catch {
      skip();
      return;
    }

    const projectRoot = await mkdtemp(join(tmpdir(), "insecur-machine-project-"));
    const report = await buildScanReport({
      rootDir: projectRoot,
      machine: true,
      homeDir: home,
    });

    expect(report.findings.some((finding) => finding.file.includes("escape-link"))).toBe(false);
  });

  it("skips missing allowlist files without reporting them unreadable", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "insecur-machine-sparse-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "insecur-machine-sparse-home-"));
    await writeScanFixtureTree(projectDir);

    const report = await buildScanReport({ rootDir: projectDir, machine: true, homeDir: homeDir });
    expect(report.summary.unreadableFiles).toEqual([]);
    expect(report.summary.machine?.filesScanned).toBe(0);
  });

  it("counts filesScanned only for allowlist files that exist and were read", async () => {
    const { projectDir: root, homeDir: home } = await createFixture();
    const report = await buildScanReport({ rootDir: root, machine: true, homeDir: home });

    expect(report.summary.machine?.filesScanned).toBe(7);
  });

  it("does not scan non-private-key filenames under ~/.ssh", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "insecur-machine-ssh-scope-"));
    const homeDir = await mkdtemp(join(tmpdir(), "insecur-machine-ssh-scope-home-"));
    await mkdir(join(homeDir, ".ssh"), { recursive: true });
    await writeFile(
      join(homeDir, ".ssh", "service-account.json"),
      JSON.stringify({ type: "service_account" }),
      "utf8",
    );

    const report = await buildScanReport({ rootDir: projectDir, machine: true, homeDir: homeDir });
    expect(report.findings.some((finding) => finding.file === "~/.ssh/service-account.json")).toBe(
      false,
    );
  });

  it("documents the allowlist in MACHINE_SCAN_ALLOWLIST_LINES", () => {
    expect(MACHINE_SCAN_ALLOWLIST_LINES.length).toBeGreaterThan(0);
    for (const fixed of MACHINE_SCAN_FIXED_FILES) {
      expect(
        MACHINE_SCAN_ALLOWLIST_LINES.some((line) => line.includes(fixed.replace(/^\./u, ""))),
      ).toBe(true);
    }
    for (const shell of MACHINE_SCAN_SHELL_RC_FILES) {
      expect(MACHINE_SCAN_ALLOWLIST_LINES.some((line) => line.includes(shell))).toBe(true);
    }
  });
});

describe("insecur scan --machine no-reveal", () => {
  const sentinels = [
    SENTINEL_SECRET_VALUE,
    SENTINEL_LOCAL_VALUE,
    SENTINEL_DECOY_VALUE,
    MACHINE_SENTINEL_SECRET_VALUE,
    MACHINE_SENTINEL_EXPORT_VALUE,
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never prints sentinel values from machine locations in any output channel", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "insecur-machine-noreveal-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "insecur-machine-noreveal-home-"));
    await writeScanFixtureTree(projectDir);
    await writeMachineScanFixtureHome(homeDir);

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

    const flags = { ...baseFlags, configDir: projectDir };

    await runScanCommand(flags, { machine: true, homeDir });
    await runScanCommand({ ...flags, json: true }, { machine: true, homeDir });
    await runScanCommand({ ...flags, quiet: true }, { strict: true, machine: true, homeDir });

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
