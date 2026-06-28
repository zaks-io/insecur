export const CLI_SESSION_TOKEN_ENV = "INSECUR_SESSION_TOKEN";

const AUTH_BEARING_INSECUR_ENV_NAME_PATTERN = /^INSECUR_.*(?:TOKEN|COOKIE|CSRF|KEY)$/u;

export interface ScrubCliChildAuthEnvOptions {
  readonly allow?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

export function isAuthBearingInsecurEnvName(name: string): boolean {
  return AUTH_BEARING_INSECUR_ENV_NAME_PATTERN.test(name);
}

export function scrubCliChildAuthEnv(options: ScrubCliChildAuthEnvOptions = {}): NodeJS.ProcessEnv {
  const { env = process.env, allow = [] } = options;
  const allowed = new Set(allow);
  const childEnv: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries(env)) {
    if (isAuthBearingInsecurEnvName(name) && !allowed.has(name)) {
      continue;
    }
    childEnv[name] = value;
  }

  return childEnv;
}
