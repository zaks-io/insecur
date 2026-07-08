import type { RuntimeAdmissionRpc } from "./runtime/admission-types.js";

/**
 * Worker secrets and RPC contracts Wrangler cannot infer from wrangler.jsonc. Generated bindings
 * and public vars live on {@link CloudflareEnv}.
 */
interface WebEnvSecrets {
  readonly WORKOS_API_KEY: string;
  readonly WORKOS_COOKIE_PASSWORD: string;
  readonly SESSION_SIGNING_SECRET: string;
  readonly WORKOS_FAKE_SESSIONS_JSON?: string;
  readonly TURNSTILE_SECRET_KEY: string;
}

/**
 * Bindings for the Web BFF (`insecur-web`, ADR-0051). Owns the browser session cookie, holds no
 * keyring and no Hyperdrive binding, and reaches the API Worker only over the private `API`
 * Service Binding with a per-request `insecur-api`-audience scoped token.
 */
export type WebEnv = Omit<CloudflareEnv, "RUNTIME"> &
  WebEnvSecrets & {
    /** Pre-auth admission seam; same Runtime RPC subset as the API edge (ADR-0077). */
    readonly RUNTIME: RuntimeAdmissionRpc;
  };

/** Bridge TanStack Start's generated `Cloudflare.Env` to the full BFF contract at runtime. */
export function asWebEnv(env: Cloudflare.Env): WebEnv {
  return env as unknown as WebEnv;
}
