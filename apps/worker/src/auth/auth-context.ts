import type { AdmittedUserResolver, InsecurAuthConfig, WorkOSSessionPort } from "@insecur/auth";
import type { WorkerEnv } from "../env.js";
import { createAdmittedUserResolver, createAuthConfig } from "./config.js";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";

export interface AuthContext {
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
}

export function createAuthContext(env: WorkerEnv): AuthContext {
  return {
    config: createAuthConfig(env),
    workos: createWorkOSSessionPortFromEnv(env),
    resolveAdmittedUser: createAdmittedUserResolver(env),
  };
}
