import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RunCliSmokeCommandInput } from "./cli-smoke-runtime.js";
import { buildCliChildEnv, resolveCliSmokePaths } from "./cli-smoke-runtime.js";

const execFileAsync = promisify(execFile);

export interface ExecCliSmokeCommandResult {
  readonly execError?: NodeJS.ErrnoException & {
    readonly code?: number | string;
    readonly stderr?: string | Buffer;
    readonly stdout?: string | Buffer;
  };
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export async function execCliSmokeCommand(
  input: RunCliSmokeCommandInput,
): Promise<ExecCliSmokeCommandResult> {
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
    const child = execFileAsync(process.execPath, [cliEntry, ...args], {
      cwd: input.cwd ?? input.configDir,
      env: buildCliChildEnv(input.configHomeDir, input.bearer),
      maxBuffer: 10 * 1024 * 1024,
    });
    if (input.stdinInput !== undefined) {
      child.child.stdin?.end(input.stdinInput);
    }
    const { stderr, stdout } = await child;
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    return readExecCliFailure(error);
  }
}

function readExecCliFailure(error: unknown): ExecCliSmokeCommandResult {
  if (typeof error !== "object" || error === null) {
    throw error;
  }
  const execError = error as NonNullable<ExecCliSmokeCommandResult["execError"]>;
  return {
    execError,
    exitCode: typeof execError.code === "number" ? execError.code : 1,
    stderr: stringifyExecOutput(execError.stderr),
    stdout: stringifyExecOutput(execError.stdout),
  };
}

function stringifyExecOutput(value: string | Buffer | undefined): string {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString("utf8");
}
