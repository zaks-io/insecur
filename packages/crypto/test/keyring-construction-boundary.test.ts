import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import {
  KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS,
  KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS,
} from "../src/keyring-construction-boundary.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const negativeFixture = path.join(
  repoRoot,
  "scripts/lint-fixtures/keyring-construction-boundary-negative.fixture.ts",
);
const allowlistedModule = path.join(repoRoot, "apps/runtime/src/crypto/keyring-context.ts");
const eslintConfigPath = path.join(repoRoot, "eslint.config.ts");
const NEWLY_COVERED_KEYRING_CONSTRUCTORS = [
  "createKeyringFromSecretsStoreBinding",
  "createKeyringFromRootKeyProvider",
  "createKeyring",
  "StaticRootKeyProvider",
] as const;
const ESLINT_BOUNDARY_TIMEOUT_MS = 15_000;
const KEYRING_BOUNDARY_MESSAGE =
  "Keyring construction is confined to apps/runtime/src/** (ADR-0064/0077)";
const eslint = new ESLint({ cwd: repoRoot });

interface LintConfigWithRules {
  rules?: Record<string, unknown>;
}

function hasLintRulesConfig(value: unknown): value is LintConfigWithRules {
  return typeof value === "object" && value !== null;
}

function formatLintOutput(results: ESLint.LintResult[]): string {
  return results
    .flatMap((result) =>
      result.messages.map(
        (message) =>
          `${path.relative(repoRoot, result.filePath)}:${String(message.line)}:${String(
            message.column,
          )} ${message.ruleId ?? "fatal"} ${message.message}`,
      ),
    )
    .join("\n");
}

async function runEslint(filePath: string): Promise<string> {
  const lintTarget = path.relative(repoRoot, filePath);
  const results = await eslint.lintFiles([lintTarget]);
  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const warningCount = results.reduce((total, result) => total + result.warningCount, 0);
  const output = formatLintOutput(results);

  if (errorCount > 0 || warningCount > 0) {
    throw new Error(`eslint failed for ${lintTarget}\n${output}`);
  }

  return output;
}

async function runEslintExpectFailure(filePath: string): Promise<string> {
  try {
    await runEslint(filePath);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`expected eslint to fail for ${filePath}`);
}

async function readLintConfigFor(filePath: string): Promise<LintConfigWithRules> {
  const lintTarget = path.relative(repoRoot, filePath);
  const config: unknown = await eslint.calculateConfigForFile(lintTarget);
  if (!hasLintRulesConfig(config)) {
    throw new Error(`eslint config not found for ${lintTarget}`);
  }
  return config;
}

function readEslintConfigSource(): string {
  return readFileSync(eslintConfigPath, "utf8");
}

describe("keyring-construction lint boundary (ADR-0064/0077)", () => {
  it("drives eslint from the shared crypto denylist constant", () => {
    const source = readEslintConfigSource();
    expect(source).toContain("KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS");
    expect(source).toContain("KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS");
    expect(source).not.toMatch(/importNames:\s*\[[\s\S]*?"createKeyringFromDevEnvRootKey"/);
  });

  it(
    "fails lint for unallowlisted keyring constructor imports",
    async () => {
      const output = await runEslintExpectFailure(negativeFixture);
      expect(output).toMatch(/no-restricted-imports/);
      for (const importName of NEWLY_COVERED_KEYRING_CONSTRUCTORS) {
        expect(output).toContain(importName);
      }
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it("lists every newly covered constructor in the crypto denylist", () => {
    expect(KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS).toEqual(
      expect.arrayContaining([...NEWLY_COVERED_KEYRING_CONSTRUCTORS]),
    );
  });

  it(
    "does not apply the keyring boundary to the runtime keyring context module",
    async () => {
      const config = await readLintConfigFor(allowlistedModule);
      const restrictedRules = JSON.stringify([
        config.rules?.["no-restricted-imports"],
        config.rules?.["no-restricted-syntax"],
      ]);

      expect(restrictedRules).not.toContain(KEYRING_BOUNDARY_MESSAGE);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it("keeps runtime-only constructors on the syntax-rule denylist", () => {
    expect(KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS).toEqual(
      expect.arrayContaining(["createKeyringFromRuntimeEnv", "RuntimeEnvRootKeyProvider"]),
    );
  });
});
