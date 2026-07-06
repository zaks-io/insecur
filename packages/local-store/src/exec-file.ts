import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildNodeExecFileOptions,
  DEFAULT_EXEC_FILE_TIMEOUT_MS,
  resolveExecFileOptions,
} from "./exec-file-options.js";
import { execFileWithStdin } from "./exec-file-spawn.js";
import type { ExecFileFn } from "./types.js";

export { buildNodeExecFileOptions, DEFAULT_EXEC_FILE_TIMEOUT_MS, resolveExecFileOptions };

export function createDefaultExecFile(): ExecFileFn {
  const promisifiedExecFile = promisify(nodeExecFile);
  return async (file, args, options) => {
    const resolvedOptions = resolveExecFileOptions(options);
    if (resolvedOptions.input !== undefined) {
      return execFileWithStdin(file, args, {
        ...resolvedOptions,
        input: resolvedOptions.input,
      });
    }

    const result = await promisifiedExecFile(file, args, buildNodeExecFileOptions(resolvedOptions));
    return {
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  };
}
