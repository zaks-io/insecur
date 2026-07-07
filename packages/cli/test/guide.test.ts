import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runGuideCommand } from "../src/commands/guide.js";
import { runCli } from "../src/program.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { formatGuideTopicList, getGuideTopic, listGuideTopicIds } from "../src/guides/registry.js";
import { formatScanHumanReport, SCAN_MIGRATE_ENV_GUIDE_POINTER } from "../src/scan/report.js";
import type { ScanReport } from "../src/scan/types.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const distBundlePath = join(packageRoot, "dist", "index.js");

describe("insecur guide", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists migrate-env in the topic registry", () => {
    expect(listGuideTopicIds()).toContain("migrate-env");
    const topic = getGuideTopic("migrate-env");
    expect(topic?.description).toMatch(/disk secrets/i);
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
  });
});

describe("insecur guide bundle", () => {
  it("embeds migrate-env content in the built dist bundle", async () => {
    const bundle = await readFile(distBundlePath, "utf8");
    expect(bundle).toContain("Safe playbook for moving disk secrets into insecur");
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
