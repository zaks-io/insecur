import type { AdmittedUserResolver, InsecurAuthConfig, WorkOSSessionPort } from "@insecur/auth";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { createAdmittedUserResolver } from "./admitted-user-resolver.js";
import { createAuthConfig } from "./config.js";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";

export type AuthConfigField =
  | "workos.clientId"
  | "workos.apiKey"
  | "workos.cookiePassword"
  | "sessionSigningSecret";

export class AuthConfigError extends Error {
  readonly field: AuthConfigField;

  constructor(field: AuthConfigField) {
    super(authConfigErrorMessage(field));
    this.name = "AuthConfigError";
    this.field = field;
  }
}

function authConfigErrorMessage(field: AuthConfigField): string {
  switch (field) {
    case "workos.clientId":
      return "auth configuration invalid: workos.clientId must be a non-empty value";
    case "workos.apiKey":
      return "auth configuration invalid: workos.apiKey must be a non-empty value";
    case "workos.cookiePassword":
      return "auth configuration invalid: workos.cookiePassword must be a non-empty value";
    case "sessionSigningSecret":
      return "auth configuration invalid: sessionSigningSecret must be a non-empty value of at least 32 characters";
  }
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export function validateAuthContext(config: InsecurAuthConfig): void {
  if (isBlank(config.workos.clientId)) {
    throw new AuthConfigError("workos.clientId");
  }
  if (isBlank(config.workos.apiKey)) {
    throw new AuthConfigError("workos.apiKey");
  }
  if (isBlank(config.workos.cookiePassword)) {
    throw new AuthConfigError("workos.cookiePassword");
  }
  if (isBlank(config.sessionSigningSecret)) {
    throw new AuthConfigError("sessionSigningSecret");
  }
  if (config.sessionSigningSecret.length < 32) {
    throw new AuthConfigError("sessionSigningSecret");
  }
}

export interface AuthContext {
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
}

export interface CreateAuthContextOptions {
  readonly resolveAdmittedUser?: AdmittedUserResolver;
}

export function createAuthContext(
  env: AuthWorkerEnv,
  options?: CreateAuthContextOptions,
): AuthContext {
  const config = createAuthConfig(env);
  validateAuthContext(config);
  return {
    config,
    workos: createWorkOSSessionPortFromEnv(env),
    resolveAdmittedUser: options?.resolveAdmittedUser ?? createAdmittedUserResolver(env),
  };
}
