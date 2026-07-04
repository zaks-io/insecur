import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const negativeFixture = path.join(
  repoRoot,
  "scripts/lint-fixtures/decrypt-import-boundary-negative.fixture.ts",
);
const negativeDynamicFixture = path.join(
  repoRoot,
  "scripts/lint-fixtures/decrypt-import-boundary-negative-dynamic.fixture.ts",
);
const negativeDeepPathFixture = path.join(
  repoRoot,
  "scripts/lint-fixtures/decrypt-import-boundary-negative-deep-path.fixture.ts",
);
const ESLINT_BOUNDARY_TIMEOUT_MS = 15_000;
const DECRYPT_IMPORT_BOUNDARY_MESSAGE =
  "Decrypt entry points may only be imported from allowlisted egress modules";
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

function readDecryptImportAllowlist(): string[] {
  const configSource = readFileSync(path.join(repoRoot, "eslint.config.ts"), "utf8");
  const allowlistMatch = /DECRYPT_IMPORT_ALLOWLIST = \[([\s\S]*?)\] as const/.exec(configSource);
  const quotedEntries = allowlistMatch?.[1]?.match(/"([^"]+)"/g);
  if (!quotedEntries) {
    throw new Error("DECRYPT_IMPORT_ALLOWLIST not found in eslint.config.ts");
  }
  return quotedEntries.map((entry) => entry.slice(1, -1));
}

async function readLintConfigFor(filePath: string): Promise<LintConfigWithRules> {
  const lintTarget = path.relative(repoRoot, filePath);
  const config: unknown = await eslint.calculateConfigForFile(lintTarget);
  if (!hasLintRulesConfig(config)) {
    throw new Error(`eslint config not found for ${lintTarget}`);
  }
  return config;
}

describe("decrypt-import lint boundary (ADR-0071)", () => {
  it(
    "fails lint for unallowlisted decrypt imports",
    async () => {
      const output = await runEslintExpectFailure(negativeFixture);
      expect(output).toMatch(/no-restricted-imports/);
      expect(output).toMatch(/decryptSecretValueForRuntime/);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it(
    "fails lint for unallowlisted dynamic decrypt module imports",
    async () => {
      const output = await runEslintExpectFailure(negativeDynamicFixture);
      expect(output).toMatch(/no-restricted-syntax/);
      expect(output).toMatch(/Decrypt entry points may only be imported/);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it(
    "fails lint for unallowlisted deep-path decrypt imports",
    async () => {
      const output = await runEslintExpectFailure(negativeDeepPathFixture);
      expect(output).toMatch(/no-restricted-imports/);
      expect(output).toMatch(/decryptSecretValueForRuntime/);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it(
    "fails lint for decrypt imports in unallowlisted backup-restore sibling modules",
    async () => {
      const output = await runEslintExpectFailure(
        path.join(
          repoRoot,
          "scripts/lint-fixtures/decrypt-import-boundary-negative-backup-restore-sibling.fixture.ts",
        ),
      );
      expect(output).toMatch(/no-restricted-imports/);
      expect(output).toMatch(/decryptSecretValueForRuntime/);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it(
    "fails lint for decrypt imports under keyring-only allowlist paths",
    async () => {
      const fixturePath = path.join(
        repoRoot,
        "packages/tenant-keyring/src/.decrypt-import-boundary-negative.fixture.ts",
      );
      writeFileSync(
        fixturePath,
        [
          'import { decryptSecretValueForRuntime } from "@insecur/crypto";',
          "",
          "export function tenantKeyringDecryptImport(): typeof decryptSecretValueForRuntime {",
          "  return decryptSecretValueForRuntime;",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );

      try {
        const output = await runEslintExpectFailure(fixturePath);
        expect(output).toMatch(/no-restricted-imports/);
        expect(output).toMatch(/decryptSecretValueForRuntime/);
      } finally {
        unlinkSync(fixturePath);
      }
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it(
    "applies decrypt boundary to tenant-keyring production modules",
    async () => {
      const config = await readLintConfigFor(
        path.join(repoRoot, "packages/tenant-keyring/src/index.ts"),
      );
      const restrictedRules = JSON.stringify([
        config.rules?.["no-restricted-imports"],
        config.rules?.["no-restricted-syntax"],
      ]);

      expect(restrictedRules).toContain(DECRYPT_IMPORT_BOUNDARY_MESSAGE);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it(
    "applies decrypt boundary to backup-restore sources outside recovery-canary",
    async () => {
      const config = await readLintConfigFor(
        path.join(repoRoot, "packages/backup-restore/src/backup-envelope.ts"),
      );
      const restrictedRules = JSON.stringify([
        config.rules?.["no-restricted-imports"],
        config.rules?.["no-restricted-syntax"],
      ]);

      expect(restrictedRules).toContain(DECRYPT_IMPORT_BOUNDARY_MESSAGE);
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );

  it("keeps the allowlisted decrypt egress modules", () => {
    expect(readDecryptImportAllowlist()).toEqual([
      "packages/runtime-injection/src/decrypt-grant-secret.ts",
      "packages/backup-restore/src/recovery-canary.ts",
      "packages/app-connection/src/decrypt-provider-credential-for-validation.ts",
      "packages/app-connection/src/decrypt-cloudflare-connection-boundary-for-validation.ts",
    ]);
  });

  it(
    "does not apply the decrypt boundary to allowlisted egress modules",
    async () => {
      for (const allowlistedPath of readDecryptImportAllowlist()) {
        const config = await readLintConfigFor(path.join(repoRoot, allowlistedPath));
        const restrictedRules = JSON.stringify([
          config.rules?.["no-restricted-imports"],
          config.rules?.["no-restricted-syntax"],
        ]);

        expect(restrictedRules).not.toContain(DECRYPT_IMPORT_BOUNDARY_MESSAGE);
      }
    },
    ESLINT_BOUNDARY_TIMEOUT_MS,
  );
});
