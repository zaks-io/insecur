import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CliSmokeWorkspace {
  readonly configDir: string;
  readonly configHomeDir: string;
  cleanup(): Promise<void>;
}

export interface CliSmokePaths {
  readonly cliEntry: string;
  readonly repoRoot: string;
  readonly verifyScript: string;
}

export interface RunCliSmokeCommandInput {
  readonly apiBaseUrl: string;
  readonly args: readonly string[];
  readonly bearer: string;
  readonly configDir: string;
  readonly configHomeDir: string;
  readonly cwd?: string;
  readonly label: string;
  readonly redactor: (value: unknown) => string;
  /** Written to the child's stdin (e.g. the sentinel value for `secrets set --value-stdin`). */
  readonly stdinInput?: string;
}

export async function createCliSmokeWorkspace(): Promise<CliSmokeWorkspace> {
  const configHomeDir = await mkdtemp(join(tmpdir(), "insecur-preview-cli-home-"));
  const configDir = await mkdtemp(join(tmpdir(), "insecur-preview-cli-project-"));
  return {
    configDir,
    configHomeDir,
    async cleanup() {
      await Promise.all([
        rm(configHomeDir, { recursive: true, force: true }),
        rm(configDir, { recursive: true, force: true }),
      ]);
    },
  };
}

export function resolveCliSmokePaths(): CliSmokePaths {
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const cliEntry = join(repoRoot, "packages/cli/dist/index.js");
  const verifyScript = join(repoRoot, "examples/first-value-proof/verify.mjs");
  if (!existsSync(cliEntry)) {
    throw new Error(
      `CLI release entry missing at ${cliEntry}. Run pnpm --filter @insecur/cli build before preview smoke.`,
    );
  }
  if (!existsSync(verifyScript)) {
    throw new Error(`First Value verifier missing at ${verifyScript}`);
  }
  return { cliEntry, repoRoot, verifyScript };
}

export function buildCliChildEnv(configHomeDir: string, bearer: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    INSECUR_CONFIG_HOME: configHomeDir,
    INSECUR_SESSION_TOKEN: bearer,
  };
}
