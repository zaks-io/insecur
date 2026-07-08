import type { RuntimeAdmissionRpc } from "./runtime/admission-types.js";

/** See `web-env-secrets.d.ts` for the secret fields merged into `Cloudflare.Env`. */
type WebEnvSecrets = Pick<
  Cloudflare.Env,
  | "WORKOS_API_KEY"
  | "WORKOS_COOKIE_PASSWORD"
  | "SESSION_SIGNING_SECRET"
  | "WORKOS_FAKE_SESSIONS_JSON"
  | "TURNSTILE_SECRET_KEY"
>;

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

/** Wrangler types RPC entrypoints as `Service`; narrow to the admission seam we call. */
function runtimeAdmissionBinding(binding: CloudflareEnv["RUNTIME"]): RuntimeAdmissionRpc {
  return binding as unknown as RuntimeAdmissionRpc;
}

/** Bridge TanStack Start's generated `Cloudflare.Env` to the full BFF contract at runtime. */
export function asWebEnv(env: Cloudflare.Env): WebEnv {
  const bindings = env as CloudflareEnv & WebEnvSecrets;
  return {
    ...bindings,
    RUNTIME: runtimeAdmissionBinding(bindings.RUNTIME),
  };
}
