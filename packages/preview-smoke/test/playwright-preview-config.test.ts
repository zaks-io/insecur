import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import config from "../playwright.preview.config";
import { PREVIEW_SMOKE_ARTIFACT_ROOT } from "../src/artifact-root";

describe("preview smoke diagnostics", () => {
  it("keeps one release-runner CPU free while parallelizing smoke", () => {
    expect(config.workers).toBe(3);
  });

  it("keeps safe failure diagnostics while disabling credential-bearing traces", () => {
    expect(config.use?.trace).toBe("off");
    expect(config.use?.screenshot).toBe("only-on-failure");
    expect(config.use?.video).toBe("retain-on-failure");
    expect(config.reporter).toEqual(
      expect.arrayContaining([
        ["html", expect.any(Object)],
        ["json", expect.any(Object)],
        ["junit", expect.any(Object)],
      ]),
    );
  });

  it("writes artifacts to the exact tree the credential sweep scans and CI uploads", () => {
    const repoRootArtifacts = fileURLToPath(
      new URL("../../../preview-smoke-artifacts", import.meta.url),
    );
    expect(PREVIEW_SMOKE_ARTIFACT_ROOT).toBe(repoRootArtifacts);
    expect(config.outputDir).toBe(join(PREVIEW_SMOKE_ARTIFACT_ROOT, "test-results"));
    for (const [name, options] of reporterEntries(config.reporter)) {
      const target =
        name === "html"
          ? (options as { outputFolder?: string }).outputFolder
          : (options as { outputFile?: string }).outputFile;
      expect(target, `${name} reporter output`).toContain(PREVIEW_SMOKE_ARTIFACT_ROOT);
    }
  });
});

function reporterEntries(reporter: unknown): [string, object][] {
  if (!Array.isArray(reporter)) {
    throw new Error("Expected reporter array");
  }
  return reporter
    .filter((entry): entry is [string, object] => Array.isArray(entry) && entry.length === 2)
    .filter(([name]) => name === "html" || name === "json" || name === "junit");
}
