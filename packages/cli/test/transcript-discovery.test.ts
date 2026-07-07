import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { INVALID_GLOB_SENTINEL } = vi.hoisted(() => ({
  INVALID_GLOB_SENTINEL: "INVALID_GLOB_SENTINEL_PATTERN",
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    glob: (pattern: string, options?: Parameters<typeof actual.glob>[1]) => {
      if (pattern === INVALID_GLOB_SENTINEL) {
        throw new Error("mock glob failure");
      }
      return actual.glob(pattern, options);
    },
  };
});

import { collectTranscriptFiles } from "../src/scan/transcripts/discovery.js";

describe("transcript discovery glob handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces invalid explicit --transcript-glob patterns as metadata-only warnings", async () => {
    const result = await collectTranscriptFiles({
      transcriptGlobs: [INVALID_GLOB_SENTINEL],
    });

    expect(result.files).toHaveLength(0);
    expect(result.warnings).toEqual([
      {
        code: "transcript.glob_invalid",
        message: "Explicit transcript glob pattern is invalid.",
        sourcePath: INVALID_GLOB_SENTINEL,
      },
    ]);
  });

  it("still collects valid explicit globs and preserves limitReached behavior", async () => {
    const root = await mkdtemp(join(tmpdir(), "insecur-transcript-glob-"));
    const exportsDir = join(root, "exports");
    await mkdir(exportsDir, { recursive: true });
    const transcriptPath = join(exportsDir, "session.jsonl");
    await writeFile(transcriptPath, '{"role":"user"}\n', "utf8");

    const result = await collectTranscriptFiles({
      transcriptGlobs: [join(exportsDir, "*.jsonl")],
      maxTranscriptFiles: 1,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.absolutePath).toBe(transcriptPath);
    expect(result.limitReached).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "transcript.glob_invalid")).toBe(
      false,
    );
  });
});
