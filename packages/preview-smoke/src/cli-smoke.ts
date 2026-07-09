import { assertEqual, asRecord } from "./http";
import { PROOF_VARIABLE_KEY } from "./cli-smoke-commands.js";
import { execCliSmokeCommand } from "./cli-smoke-exec.js";
import type { RunCliSmokeCommandInput } from "./cli-smoke-runtime.js";

export { createCliSmokeWorkspace, resolveCliSmokePaths } from "./cli-smoke-runtime.js";
export {
  buildCliAgentEnvArgs,
  buildCliAgentRegisterArgs,
  buildCliAuditExportArgs,
  buildCliAuditTailArgs,
  buildCliAuditVerifyArgs,
  buildCliFirstValueRunArgs,
  buildCliOperationsGetArgs,
  buildCliOperationsWaitArgs,
  buildCliRunPoliciesCreateArgs,
  buildCliRunPoliciesDisableArgs,
  buildCliRunPoliciesShowArgs,
  buildCliSecretsSetGenerateArgs,
  buildCliSecretsSetValueStdinArgs,
  buildCliSecretsVersionsArgs,
  buildCliWhoamiArgs,
  PROOF_VARIABLE_KEY,
} from "./cli-smoke-commands.js";

export async function runCliSmokeCommand(
  input: RunCliSmokeCommandInput,
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  const result = await execCliSmokeCommand(input);
  if (result.exitCode !== 0) {
    throw redactedCliCommandError(
      input,
      result.execError ?? new Error(`exit ${String(result.exitCode)}`),
    );
  }
  assertCliOutputSafe({
    label: input.label,
    redactor: input.redactor,
    stderr: result.stderr,
    stdout: result.stdout,
  });
  return { stderr: result.stderr, stdout: result.stdout };
}

export async function runCliSmokeCommandExpectFailure(
  input: RunCliSmokeCommandInput,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const result = await execCliSmokeCommand(input);
  assertCliOutputSafe({
    label: input.label,
    redactor: input.redactor,
    stderr: result.stderr,
    stdout: result.stdout,
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr,
    stdout: result.stdout,
  };
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
export function parseLastCliSmokeJson(output: string, label: string): Record<string, unknown> {
  const object = firstParsableObject(outputLines(output).reverse());
  if (object === undefined) {
    throw new Error(`${label} returned no JSON object`);
  }
  return object;
}

/**
 * The child proof JSON precedes the CLI envelope, so it is the FIRST
 * well-formed JSON object on stdout. Walk lines from the start.
 */
export function parseCliRunChildProof(stdout: string, label: string): Record<string, unknown> {
  const object = firstParsableObject(outputLines(stdout));
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

function outputLines(output: string): string[] {
  return output
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
    readonly stderr?: string | Buffer;
    readonly stdout?: string | Buffer;
    readonly signal?: NodeJS.Signals;
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
