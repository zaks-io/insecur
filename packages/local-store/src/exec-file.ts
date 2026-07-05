import type { ExecFileOptions } from "node:child_process";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExecFileFn } from "./types.js";

const promisifiedExecFile = promisify(nodeExecFile);

export function createDefaultExecFile(): ExecFileFn {
  return async (file, args, options) => {
    const nodeOptions: ExecFileOptions = {
      encoding: "utf8",
      maxBuffer: 1024,
      ...options,
    };
    const result = await promisifiedExecFile(file, args, nodeOptions);
    return {
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  };
}
