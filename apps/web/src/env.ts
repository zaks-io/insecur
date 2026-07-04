import type { SentryBindings } from "@insecur/observability";
import type { RuntimeAdmissionRpc } from "./runtime/admission-types.js";

/**
 * Bindings for the Web BFF (`insecur-web`, ADR-0051). Owns the browser session cookie, holds no
 * keyring and no Hyperdrive binding, and reaches the API Worker only over the private `API`
 * Service Binding with a per-request `insecur-api`-audience scoped token.
 */
export interface WebEnv extends SentryBindings {
  readonly WORKOS_API_KEY: string;
  readonly WORKOS_CLIENT_ID: string;
  readonly WORKOS_COOKIE_PASSWORD: string;
  readonly SESSION_SIGNING_SECRET: string;
  readonly INSTANCE_ID?: string;
  readonly WORKOS_FAKE_SESSIONS_JSON?: string;
  /** Private Service Binding to the public API Worker (`insecur-api`). */
  readonly API: Fetcher;
  /** Pre-auth admission seam; same Runtime RPC subset as the API edge (ADR-0077). */
  readonly RUNTIME: RuntimeAdmissionRpc;
}
