/**
 * Worker secrets Wrangler cannot infer from wrangler.jsonc. Merged into {@link Cloudflare.Env} so
 * TanStack Start's `cloudflare:workers` binding includes the runtime secret contract.
 */
declare namespace Cloudflare {
  interface Env {
    readonly WORKOS_API_KEY: string;
    readonly WORKOS_COOKIE_PASSWORD: string;
    readonly SESSION_SIGNING_SECRET: string;
    readonly WORKOS_FAKE_SESSIONS_JSON?: string;
    readonly TURNSTILE_SECRET_KEY: string;
  }
}
