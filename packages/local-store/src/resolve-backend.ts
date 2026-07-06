import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";

import type { KeyStoreBackend } from "./types.js";

function isExecutableOnPath(command: string, env: NodeJS.ProcessEnv): boolean {
  const pathValue = env.PATH ?? env.Path;
  if (pathValue === undefined || pathValue === "") {
    return false;
  }

  for (const directory of pathValue.split(path.delimiter)) {
    if (directory === "") {
      continue;
    }
    try {
      accessSync(path.join(directory, command), fsConstants.X_OK);
      return true;
    } catch {
      // continue scanning PATH
    }
  }

  return false;
}

export function resolveKeyStoreBackend(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): KeyStoreBackend {
  switch (platform) {
    case "darwin":
      return "macos-keychain";
    case "win32":
      return "windows-dpapi";
    case "linux":
      return isLinuxSecretToolAvailable(env) ? "linux-secret-tool" : "file-fallback";
    default:
      return "file-fallback";
  }
}

export function isLinuxSecretToolAvailable(env: NodeJS.ProcessEnv): boolean {
  return isExecutableOnPath("secret-tool", env);
}
