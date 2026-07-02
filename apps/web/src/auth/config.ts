import type { InsecurAuthConfig } from "@insecur/auth";
import type { WebEnv } from "../env.js";

export function createAuthConfig(env: WebEnv): InsecurAuthConfig {
  return {
    workos: {
      apiKey: env.WORKOS_API_KEY,
      clientId: env.WORKOS_CLIENT_ID,
      cookiePassword: env.WORKOS_COOKIE_PASSWORD,
    },
    sessionSigningSecret: env.SESSION_SIGNING_SECRET,
  };
}
