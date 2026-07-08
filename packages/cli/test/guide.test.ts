import { execFile } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runGuideCommand } from "../src/commands/guide.js";
import { runCli } from "../src/program.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { formatGuideTopicList, getGuideTopic, listGuideTopicIds } from "../src/guides/registry.js";
import { formatScanHumanReport, SCAN_MIGRATE_ENV_GUIDE_POINTER } from "../src/scan/report.js";
import { writeScanFixtureTree } from "./fixtures/scan-fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const distBundlePath = join(packageRoot, "dist", "index.js");
const execFileAsync = promisify(execFile);

describe("insecur guide", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists hooks and migrate-env in the topic registry", () => {
    expect(listGuideTopicIds()).toEqual(["hooks", "migrate-env"]);
    const hooksTopic = getGuideTopic("hooks");
    expect(hooksTopic?.description).toMatch(/scan-gate/i);
    const migrateTopic = getGuideTopic("migrate-env");
    expect(migrateTopic?.description).toMatch(/disk secrets/i);
  });

  it("prints the topic list when no topic is given", () => {
    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });

    expect(runGuideCommand()).toBe(0);
    expect(stdoutChunks.join("")).toBe(`${formatGuideTopicList()}\n`);
  });

  it("prints migrate-env markdown to stdout", () => {
    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });

    const topic = getGuideTopic("migrate-env");
    expect(topic).toBeDefined();

    expect(runGuideCommand("migrate-env")).toBe(0);
    expect(stdoutChunks.join("")).toBe(`${topic?.content.trimEnd()}\n`);
  });

  it("rejects unknown topics with exit code 2 and lists valid topics", () => {
    expect(() => runGuideCommand("not-a-topic")).toThrowError(
      expect.objectContaining({
        exitCode: EXIT_VALIDATION,
        message: expect.stringContaining("Unknown guide topic: not-a-topic"),
      }),
    );

    try {
      runGuideCommand("not-a-topic");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("migrate-env");
    }
  });

  it("keeps insecur run verification before destructive disk edits in migrate-env", () => {
    const content = getGuideTopic("migrate-env")?.content ?? "";
    const runVerificationIndex = content.indexOf("Prove the app runs correctly with `insecur run`");
    const destructiveIndex = content.indexOf("Strip disk secrets (destructive");
    expect(runVerificationIndex).toBeGreaterThan(-1);
    expect(destructiveIndex).toBeGreaterThan(-1);
    expect(runVerificationIndex).toBeLessThan(destructiveIndex);
  });

  it("never instructs piping secret values through the terminal", () => {
    const content = getGuideTopic("migrate-env")?.content ?? "";
    expect(content).toContain("--value-stdin");
    expect(content).not.toMatch(/secrets set [^\n]*--value\s/);
    expect(content).not.toMatch(/echo\s+['"]/i);
  });

  it("addresses non-migratable findings as manual work", () => {
    const content = getGuideTopic("migrate-env")?.content ?? "";
    expect(content).toMatch(/non-migratable/i);
    expect(content).toMatch(/private key/i);
    expect(content).toMatch(/credential json/i);
    expect(content).toMatch(/no automated migration/i);
  });

  it("works offline through runCli without auth", async () => {
    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });

    const exitCode = await runCli(["node", "insecur", "guide"]);
    expect(exitCode).toBe(0);
    expect(stdoutChunks.join("")).toContain("migrate-env");
    expect(stdoutChunks.join("")).toContain("hooks");
  });
});

describe("insecur guide hooks topic", () => {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const cliEntrypoint = join(packageRoot, "dist", "index.js");

  beforeAll(async () => {
    await execFileAsync(process.execPath, ["build.mjs"], { cwd: packageRoot });
  }, 15_000);

  function buildClaudeStrictScript(insecurCommand: string): string {
    const lines = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'stderr_file="$(mktemp)"',
      "trap 'rm -f \"$stderr_file\"' EXIT",
      `if ${insecurCommand} scan --strict --quiet 2>"$stderr_file"; then`,
      "  exit 0",
      "fi",
      'summary="$(tr -d \'\\n\' <"$stderr_file")"',
      "likely=\"$(printf '%s' \"$summary\" | sed -n 's/.*likely_secrets=\\([0-9][0-9]*\\).*/\\1/p')\"",
      "files=\"$(printf '%s' \"$summary\" | sed -n 's/.*files=\\([0-9][0-9]*\\).*/\\1/p')\"",
      'likely="${likely:-?}"',
      'files="${files:-?}"',
      'printf \'Blocked: insecur scan found %s likely secret(s) in %s file(s) on disk. Run `insecur guide migrate-env` before reading project files.\\n\' "$likely" "$files" >&2',
      "exit 2",
      "",
    ];
    return `${lines.join("\n")}\n`;
  }

  it("prints hooks markdown with advisory and strict recipes for both runtimes", () => {
    const content = getGuideTopic("hooks")?.content ?? "";
    expect(content).toMatch(/Claude Code/);
    expect(content).toMatch(/Codex/);
    expect(content).toMatch(/Advisory/i);
    expect(content).toMatch(/Strict/i);
    expect(content).toMatch(/SessionStart/);
    expect(content).toMatch(/PreToolUse/);
    expect(content).toMatch(/insecur scan --strict --quiet/);
    expect(content).toMatch(/insecur guide migrate-env/);
    expect(content).toMatch(/silent when clean/i);
    expect(content).toMatch(/code\.claude\.com\/docs\/en\/hooks/);
    expect(content).toMatch(/developers\.openai\.com\/codex\/hooks/);
  });

  it("never embeds secret values or realistic tokens in hooks recipes", () => {
    const content = getGuideTopic("hooks")?.content ?? "";
    expect(content).not.toMatch(/sk-[a-z0-9]{20,}/i);
    expect(content).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(content).toMatch(/DEMO_KEY=placeholder/);
  });

  it("states counts-only exposure when hot (no key lists in agent context)", () => {
    const content = getGuideTopic("hooks")?.content ?? "";
    expect(content).toMatch(/counts/i);
    expect(content).toMatch(/never key names/i);
  });

  it("claude strict hook script blocks hot dirs and stays silent on clean dirs", async () => {
    const insecurCommand = `${process.execPath} ${cliEntrypoint}`;
    const scriptPath = join(await mkdtemp(join(tmpdir(), "insecur-hook-script-")), "strict.sh");
    await writeFile(scriptPath, buildClaudeStrictScript(insecurCommand), { mode: 0o755 });
    await chmod(scriptPath, 0o755);

    const cleanDir = await mkdtemp(join(tmpdir(), "insecur-hook-clean-"));
    const cleanResult = await execFileAsync("bash", [scriptPath], { cwd: cleanDir });
    expect(cleanResult.stdout).toBe("");
    expect(cleanResult.stderr).toBe("");

    const hotDir = await mkdtemp(join(tmpdir(), "insecur-hook-hot-"));
    await writeScanFixtureTree(hotDir);
    await expect(execFileAsync("bash", [scriptPath], { cwd: hotDir })).rejects.toMatchObject({
      code: 2,
    });
    try {
      await execFileAsync("bash", [scriptPath], { cwd: hotDir });
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
      expect(stderr).toMatch(/insecur guide migrate-env/);
      expect(stderr).toMatch(/likely secret/i);
      expect(stderr).not.toMatch(/SENTINEL_SCAN_TEST_VALUE/);
      expect(stderr).not.toMatch(/API_SECRET=/);
    }
  });
});

describe("insecur guide bundle", () => {
  beforeAll(async () => {
    await execFileAsync(process.execPath, ["build.mjs"], { cwd: packageRoot });
  }, 15_000);

  it("embeds guide content in the built dist bundle", async () => {
    const bundle = await readFile(distBundlePath, "utf8");
    expect(bundle).toContain("Safe playbook for moving disk secrets into insecur");
    expect(bundle).toContain("Agent scan-gate hook recipes for Claude Code and Codex");
    expect(bundle).toContain("insecur scan --strict");
    expect(bundle).not.toMatch(/sk-[a-z0-9]{20,}/i);
  });
});

describe("scan human guide pointer", () => {
  const emptyReport: ScanReport = {
    findings: [],
    summary: {
      filesScanned: 0,
      filesWithFindings: 0,
      unreadableFiles: [],
      oversizedFiles: [],
      limitReached: false,
      totalEntries: 0,
      likelySecrets: 0,
      migratableCount: 0,
      elapsedMs: 1,
    },
  };

  it("ends human scan output with the migrate-env guide pointer", () => {
    const output = formatScanHumanReport(emptyReport);
    expect(output.endsWith(SCAN_MIGRATE_ENV_GUIDE_POINTER)).toBe(true);
  });
});
