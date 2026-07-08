import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { assertEqual, asRecord } from "./http";

const execFileAsync = promisify(execFile);

const PROOF_VARIABLE_KEY = "INSECUR_PROOF_SECRET";

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
}

export interface CliSmokeCommandResult {
  readonly stderr: string;
  readonly stdout: string;
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

export async function runCliSmokeCommand(
  input: RunCliSmokeCommandInput,
): Promise<CliSmokeCommandResult> {
  const { cliEntry } = resolveCliSmokePaths();
  const args = [
    "--host",
    input.apiBaseUrl,
    "--config-dir",
    input.configDir,
    "--json",
    ...input.args,
  ];

  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [cliEntry, ...args], {
      cwd: input.cwd ?? input.configDir,
      env: buildCliChildEnv(input.configHomeDir, input.bearer),
      maxBuffer: 10 * 1024 * 1024,
    });
    assertCliOutputSafe({ label: input.label, redactor: input.redactor, stderr, stdout });
    return { stderr, stdout };
  } catch (error) {
    throw redactedCliCommandError(input, error);
  }
}

export function parseCliSmokeJson(stdout: string, label: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (trimmed === "") {
    throw new Error(`${label} produced no JSON output`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} returned non-JSON stdout`);
  }

  return asRecord(parsed, label);
}

/**
 * The `run` command inherits the child's stdio, so the child's proof JSON is
 * emitted first and the CLI `--json` envelope is the LAST well-formed JSON
 * object on stdout. Walk lines from the end and return the first that parses.
 */
export function parseLastCliSmokeJson(stdout: string, label: string): Record<string, unknown> {
  const object = firstParsableObject(stdoutLines(stdout).reverse());
  if (object === undefined) {
    throw new Error(`${label} returned no JSON object on stdout`);
  }
  return object;
}

/**
 * The child proof JSON precedes the CLI envelope, so it is the FIRST
 * well-formed JSON object on stdout. Walk lines from the start.
 */
export function parseCliRunChildProof(stdout: string, label: string): Record<string, unknown> {
  const object = firstParsableObject(stdoutLines(stdout));
  if (object === undefined) {
    throw new Error(`${label} child emitted no JSON proof on stdout`);
  }
  return object;
}

/**
 * childExitCode === 0 is necessary but not sufficient: the child must report it
 * actually observed the injected sentinel (verify.mjs succeeds only when it
 * reads INSECUR_PROOF_SECRET and passes the HMAC challenge).
 */
export function assertCliRunChildObservedSentinel(
  proof: Record<string, unknown>,
  label: string,
): void {
  assertEqual(proof.ok, true, `${label} child proof ok`);
  assertEqual(proof.checked, PROOF_VARIABLE_KEY, `${label} child proof checked`);
  assertEqual(proof.proof, "hmac-challenge", `${label} child proof kind`);
}

function stdoutLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function firstParsableObject(lines: readonly string[]): Record<string, unknown> | undefined {
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return undefined;
}

export function assertCliSmokeSuccess(body: Record<string, unknown>, label: string): void {
  assertEqual(body.ok, true, `${label} ok`);
}

export function assertCliRunChildExitCode(body: Record<string, unknown>, label: string): void {
  const data = asRecord(body.data, `${label} data`);
  assertEqual(data.childExitCode, 0, `${label} childExitCode`);
}

export function buildCliFirstValueRunArgs(verifyScript: string): readonly string[] {
  return [
    "run",
    "--variable-key",
    PROOF_VARIABLE_KEY,
    "--",
    process.execPath,
    verifyScript,
    "--json",
  ];
}

export function buildCliSecretsSetGenerateArgs(): readonly string[] {
  return ["secrets", "set", "--variable-key", PROOF_VARIABLE_KEY, "--generate"];
}

function buildCliChildEnv(configHomeDir: string, bearer: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    INSECUR_CONFIG_HOME: configHomeDir,
    INSECUR_SESSION_TOKEN: bearer,
  };
}

export function assertCliOutputSafe(input: {
  readonly label: string;
  readonly redactor: (value: unknown) => string;
  readonly stderr: string;
  readonly stdout: string;
}): void {
  for (const [channel, text] of [
    ["stdout", input.stdout],
    ["stderr", input.stderr],
  ] as const) {
    if (input.redactor(text) !== text) {
      throw new Error(`${input.label} leaked a secret value in CLI ${channel}`);
    }
  }
}

function redactedCliCommandError(input: RunCliSmokeCommandInput, error: unknown): Error {
  const redactor = input.redactor;
  if (typeof error !== "object" || error === null) {
    return new Error(`${input.label} failed: ${redactor(error)}`);
  }

  const execError = error as NodeJS.ErrnoException & {
    readonly cmd?: string;
    readonly killed?: boolean;
    readonly signal?: NodeJS.Signals;
    readonly stderr?: string | Buffer;
    readonly stdout?: string | Buffer;
  };

  const stdout = stringifyExecOutput(execError.stdout);
  const stderr = stringifyExecOutput(execError.stderr);
  const exitCode =
    "code" in execError && typeof execError.code === "number" ? String(execError.code) : "unknown";
  const signal = execError.signal === undefined ? "" : ` signal=${execError.signal}`;

  return new Error(
    `${input.label} exited ${exitCode}${signal}: stdout=${redactor(stdout)} stderr=${redactor(stderr)}`,
  );
}

function stringifyExecOutput(value: string | Buffer | undefined): string {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString("utf8");
}
