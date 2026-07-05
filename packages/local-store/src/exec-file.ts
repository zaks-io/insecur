import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExecFileFn, ExecFileOptions as KeyStoreExecFileOptions } from "./types.js";

const promisifiedExecFile = promisify(nodeExecFile);

export const DEFAULT_EXEC_FILE_TIMEOUT_MS = 30_000;

type NodeExecFileOptions = ExecFileOptionsWithStringEncoding & {
  input?: string;
};

function applyOptionalExecFileFields(
  nodeOptions: NodeExecFileOptions,
  options?: KeyStoreExecFileOptions,
): void {
  if (options?.env !== undefined) {
    nodeOptions.env = options.env;
  }
  if (options?.windowsHide !== undefined) {
    nodeOptions.windowsHide = options.windowsHide;
  }
  if (options?.input !== undefined) {
    nodeOptions.input = options.input;
  }
}

function buildNodeExecFileOptions(options?: KeyStoreExecFileOptions): NodeExecFileOptions {
  const nodeOptions: NodeExecFileOptions = {
    encoding: "utf8",
    maxBuffer: options?.maxBuffer ?? 1024,
    timeout: options?.timeoutMs ?? DEFAULT_EXEC_FILE_TIMEOUT_MS,
  };
  applyOptionalExecFileFields(nodeOptions, options);
  return nodeOptions;
}

export function createDefaultExecFile(): ExecFileFn {
  return async (file, args, options) => {
    const result = await promisifiedExecFile(file, args, buildNodeExecFileOptions(options));
    return {
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  };
}
