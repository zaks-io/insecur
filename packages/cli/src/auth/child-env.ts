export const CLI_SESSION_TOKEN_ENV = "INSECUR_SESSION_TOKEN";

export const CLI_CHILD_BASELINE_ENV_KEYS = [
  "PATH",
  "SHELL",
  "TERM",
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
] as const;

export interface BuildCliChildEnvOptions {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly extraEnv?: NodeJS.ProcessEnv | undefined;
}

function copyDefinedEnvValue(
  target: NodeJS.ProcessEnv,
  source: NodeJS.ProcessEnv,
  name: string,
): void {
  const value = source[name];
  if (value !== undefined) {
    target[name] = value;
  }
}

export function buildCliChildEnv(options: BuildCliChildEnvOptions = {}): NodeJS.ProcessEnv {
  const { env = process.env, extraEnv = {} } = options;
  const childEnv: NodeJS.ProcessEnv = {};

  for (const name of CLI_CHILD_BASELINE_ENV_KEYS) {
    copyDefinedEnvValue(childEnv, env, name);
  }

  for (const [name, value] of Object.entries(extraEnv)) {
    if (value !== undefined) {
      childEnv[name] = value;
    }
  }

  return childEnv;
}
