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
  /** Extra env vars merged into the child process (e.g. a harness marker for attribution). */
  readonly extraEnv?: NodeJS.ProcessEnv;
  /** `insecur agent env` rejects `--json`; set to `false` to omit the global flag. */
  readonly json?: boolean;
}

/**
 * Known agent-harness environment markers (mirrors `KNOWN_HARNESS_MARKERS` in
 * `@insecur/agent-attribution`, duplicated here to avoid pulling preview-smoke onto that
 * package's tenant-store dependency graph). Stripped from the CLI child env by default so
 * harness auto-detection stays deterministic regardless of the host running the smoke suite
 * (e.g. this suite itself may run under Claude Code or Cursor, which set these markers).
 */
const AGENT_HARNESS_MARKER_ENV_KEYS = ["CLAUDECODE", "CURSOR_AGENT", "CURSOR_TRACE_ID"] as const;

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

function omitKeys(env: NodeJS.ProcessEnv, keys: readonly string[]): NodeJS.ProcessEnv {
  const omitted = new Set<string>(keys);
  return Object.fromEntries(Object.entries(env).filter(([key]) => !omitted.has(key)));
}

export function buildCliChildEnv(
  configHomeDir: string,
  bearer: string,
  extraEnv: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const baseline = omitKeys(
    { ...process.env, INSECUR_CONFIG_HOME: configHomeDir, INSECUR_SESSION_TOKEN: bearer },
    AGENT_HARNESS_MARKER_ENV_KEYS,
  );
  const undefinedKeys = Object.entries(extraEnv)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);
  const definedExtraEnv = Object.fromEntries(
    Object.entries(extraEnv).filter(([, value]) => value !== undefined),
  );
  return { ...omitKeys(baseline, undefinedKeys), ...definedExtraEnv };
}
