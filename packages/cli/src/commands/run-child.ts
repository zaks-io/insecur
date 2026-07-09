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

/** Drop injected Sensitive Value keys from an in-memory child env object. */
export function wipeInjectedEnvKeys(env: NodeJS.ProcessEnv, keys: readonly VariableKey[]): void {
  for (const key of keys) {
    Reflect.deleteProperty(env, key);
  }
}

export function assertSupportedProcessTreePlatform(platform = process.platform): void {
  if (platform === "win32") {
    throw new CliError({
      code: INJECTION_ERROR_CODES.grantDenied,
      message:
        "Runtime injection on Windows is unavailable until descendant processes can be contained securely.",
      retryable: false,
    });
  }
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

function forceCleanupExitedChildProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // ESRCH means the owned group ended with its direct child, so nothing remains to clean.
  }
}

export function spawnCommandManaged(
  command: readonly string[],
  childEnv: NodeJS.ProcessEnv,
): { readonly child: ChildProcess; readonly exitCode: Promise<number> } {
  const executable = command[0];
  if (executable === undefined) {
    throw new Error("spawnCommandManaged requires a validated command");
  }
  assertSupportedProcessTreePlatform();
  const args = command.slice(1);
  const child = spawn(executable, args, {
    detached: true,
    env: childEnv,
    stdio: "inherit",
    shell: false,
  });
  const exitCode = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      forceCleanupExitedChildProcessTree(child);
      resolve(exitCodeForChildClose(code, signal));
    });
  });
  return { child, exitCode };
}

/** Terminate the complete process tree that inherited injected Sensitive Values. */
export function terminateChildProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    const force = signal === "SIGKILL" ? ["/F"] : [];
    spawn("taskkill", ["/PID", String(child.pid), "/T", ...force], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The child may have replaced its process group; fall back to its direct PID.
    }
  }
  if (child.exitCode != null || child.signalCode != null) {
    return;
  }
  child.kill(signal);
}

export function spawnCommand(
  command: readonly string[],
  childEnv: NodeJS.ProcessEnv,
): Promise<number> {
  return spawnCommandManaged(command, childEnv).exitCode;
}
