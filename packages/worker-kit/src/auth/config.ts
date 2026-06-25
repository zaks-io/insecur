import type { InsecurAuthConfig } from "@insecur/auth";
import type { AuthWorkerEnv } from "./auth-worker-env.js";

export function createAuthConfig(env: AuthWorkerEnv): InsecurAuthConfig {
  return {
    workos: {
      apiKey: env.WORKOS_API_KEY,
      clientId: env.WORKOS_CLIENT_ID,
      cookiePassword: env.WORKOS_COOKIE_PASSWORD,
    },
    sessionSigningSecret: env.SESSION_SIGNING_SECRET,
  };
}
