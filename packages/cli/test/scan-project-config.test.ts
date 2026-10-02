import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { parseGlobalOptions } from "../src/cli-options.js";
import { runScanCommand } from "../src/commands/scan.js";
import { EXIT_ACTION_REQUIRED } from "../src/output/exit-codes.js";

let root: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

it("scans the discovered project from a nested directory and honors an exact override", async () => {
  root = await mkdtemp(join(tmpdir(), "insecur-scan-config-"));
  const nested = join(root, "packages", "evaluation");
  await mkdir(nested, { recursive: true });
  await mkdir(join(root, ".git"));
  await writeFile(join(root, ".insecur.json"), "{}");
  await writeFile(join(root, ".env"), "API_SECRET=synthetic-scan-fixture-value\n");
  vi.spyOn(process, "cwd").mockReturnValue(nested);

  const discovered = parseGlobalOptions({ quiet: true }).flags;
  expect(await runScanCommand(discovered, { strict: true })).toBe(EXIT_ACTION_REQUIRED);

  const explicit = parseGlobalOptions({ quiet: true, configDir: nested }).flags;
  expect(await runScanCommand(explicit, { strict: true })).toBe(0);
});
