import type { ExecFileOptionsWithStringEncoding } from "node:child_process";

import type { ExecFileOptions as KeyStoreExecFileOptions } from "./types.js";

export const DEFAULT_EXEC_FILE_TIMEOUT_MS = 30_000;

type NodeExecFileOptions = ExecFileOptionsWithStringEncoding;

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
}

export function resolveExecFileOptions(options?: KeyStoreExecFileOptions): KeyStoreExecFileOptions {
  return {
    timeoutMs: DEFAULT_EXEC_FILE_TIMEOUT_MS,
    ...options,
  };
}

export function buildNodeExecFileOptions(options?: KeyStoreExecFileOptions): NodeExecFileOptions {
  const resolvedOptions = resolveExecFileOptions(options);
  const nodeOptions: NodeExecFileOptions = {
    encoding: "utf8",
    maxBuffer: resolvedOptions.maxBuffer ?? 1024,
    timeout: resolvedOptions.timeoutMs ?? DEFAULT_EXEC_FILE_TIMEOUT_MS,
  };
  applyOptionalExecFileFields(nodeOptions, resolvedOptions);
  return nodeOptions;
}
