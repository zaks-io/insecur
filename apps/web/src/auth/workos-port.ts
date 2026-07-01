import { createWorkOSSessionPort, type WorkOSSessionPort } from "@insecur/auth";
import type { WebEnv } from "../env.js";
import { createAuthConfig } from "./config.js";

export function createWorkOSSessionPortFromEnv(env: WebEnv): WorkOSSessionPort {
  return createWorkOSSessionPort(createAuthConfig(env).workos);
}
