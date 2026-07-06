import { homedir } from "node:os";
import path from "node:path";

import {
  MACHINE_ROOT_KEY_DPAPI_FILE_NAME,
  MACHINE_ROOT_KEY_FILE_NAME,
  USER_CONFIG_DIR_NAME,
} from "./constants.js";
import type { KeyStorePaths } from "./types.js";

export function resolveUserConfigHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.INSECUR_CONFIG_HOME;
  if (override !== undefined && override !== "") {
    return override;
  }
  const home = env.HOME;
  if (home !== undefined && home !== "") {
    return home;
  }
  const userProfile = env.USERPROFILE;
  if (userProfile !== undefined && userProfile !== "") {
    return userProfile;
  }
  return homedir();
}

export function resolveKeyStorePaths(
  configHome?: string,
  env: NodeJS.ProcessEnv = process.env,
): KeyStorePaths {
  const userConfigDir = path.join(resolveUserConfigHome(env), USER_CONFIG_DIR_NAME);
  const baseDir = configHome ?? userConfigDir;
  return {
    userConfigDir: baseDir,
    machineRootKeyFilePath: path.join(baseDir, MACHINE_ROOT_KEY_FILE_NAME),
    machineRootKeyDpapiFilePath: path.join(baseDir, MACHINE_ROOT_KEY_DPAPI_FILE_NAME),
  };
}
