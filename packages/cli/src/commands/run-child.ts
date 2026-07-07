import { spawn, type ChildProcess } from "node:child_process";
import { constants as osConstants } from "node:os";
import { base64UrlToBytes, INJECTION_ERROR_CODES, type VariableKey } from "@insecur/domain";
import { buildCliChildEnv } from "../auth/child-env.js";
import { CliError } from "../output/cli-error.js";

export function decodeDeliveryValue(encodedValueUtf8: string): string {
  const bytes = base64UrlToBytes(encodedValueUtf8);
  if (bytes === null) {
    throw new CliError({
      code: INJECTION_ERROR_CODES.decryptFailed,
      message: "Grant delivery payload could not be decoded.",
      retryable: false,
    });
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function buildRunChildEnv(variableKey: VariableKey, valueUtf8: string): NodeJS.ProcessEnv {
  return buildCliChildEnv({ extraEnv: { [variableKey]: valueUtf8 } });
}

export function buildPolicyRunChildEnv(
  entries: readonly { variableKey: VariableKey; encodedValueUtf8: string }[],
): NodeJS.ProcessEnv {
  const extraEnv: Record<string, string> = {};
  for (const entry of entries) {
    extraEnv[entry.variableKey] = decodeDeliveryValue(entry.encodedValueUtf8);
  }
  return buildCliChildEnv({ extraEnv });
}

function exitCodeForChildClose(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  if (signal === null) {
    return 0;
  }
  const signalNumber = osConstants.signals[signal];
  return 128 + signalNumber;
}

export function spawnCommandManaged(
  command: readonly string[],
  childEnv: NodeJS.ProcessEnv,
): { readonly child: ChildProcess; readonly exitCode: Promise<number> } {
  const executable = command[0];
  if (executable === undefined) {
    throw new Error("spawnCommandManaged requires a validated command");
  }
  const args = command.slice(1);
  const child = spawn(executable, args, { env: childEnv, stdio: "inherit", shell: false });
  const exitCode = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve(exitCodeForChildClose(code, signal));
    });
  });
  return { child, exitCode };
}

export function spawnCommand(
  command: readonly string[],
  childEnv: NodeJS.ProcessEnv,
): Promise<number> {
  return spawnCommandManaged(command, childEnv).exitCode;
}
