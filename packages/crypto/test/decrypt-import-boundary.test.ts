import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const negativeFixture = path.join(
  repoRoot,
  "scripts/lint-fixtures/decrypt-import-boundary-negative.fixture.ts",
);
const allowlistedModule = path.join(
  repoRoot,
  "packages/runtime-injection/src/decrypt-grant-secret.ts",
);

function runEslint(filePath: string): string {
  return execFileSync("pnpm", ["exec", "eslint", filePath, "--max-warnings=0"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runEslintExpectFailure(filePath: string): string {
  try {
    runEslint(filePath);
    throw new Error(`expected eslint to fail for ${filePath}`);
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error
        ? String((error as NodeJS.ErrnoException & { stderr?: string }).stderr)
        : "";
    const stdout =
      error instanceof Error && "stdout" in error
        ? String((error as NodeJS.ErrnoException & { stdout?: string }).stdout)
        : "";
    const message = error instanceof Error ? error.message : String(error);
    return `${stderr}\n${stdout}\n${message}`;
  }
}

function readDecryptImportAllowlist(): string[] {
  const configSource = readFileSync(path.join(repoRoot, "eslint.config.ts"), "utf8");
  const allowlistMatch = /DECRYPT_IMPORT_ALLOWLIST = \[([\s\S]*?)\] as const/.exec(configSource);
  const quotedEntries = allowlistMatch?.[1]?.match(/"([^"]+)"/g);
  if (!quotedEntries) {
    throw new Error("DECRYPT_IMPORT_ALLOWLIST not found in eslint.config.ts");
  }
  return quotedEntries.map((entry) => entry.slice(1, -1));
}

describe("decrypt-import lint boundary (ADR-0071)", () => {
  it("fails lint for unallowlisted decrypt imports", () => {
    const output = runEslintExpectFailure(negativeFixture);
    expect(output).toMatch(/no-restricted-imports/);
    expect(output).toMatch(/decryptSecretValueForRuntime/);
  });

  it("keeps exactly one allowlisted decrypt egress module", () => {
    expect(readDecryptImportAllowlist()).toEqual([
      "packages/runtime-injection/src/decrypt-grant-secret.ts",
    ]);
  });

  it("passes lint for the sole allowlisted decrypt egress module", () => {
    expect(() => runEslint(allowlistedModule)).not.toThrow();
  }, 15_000);
});
