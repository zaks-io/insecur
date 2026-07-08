import type { AuthWorkerEnv, RuntimeRpc } from "@insecur/worker-kit";
import type { Hono } from "hono";

/**
 * Worker secrets and RPC contracts Wrangler cannot infer from wrangler.jsonc. Generated bindings and
 * public vars live on {@link CloudflareEnv}.
 */
type ApiEnvContracts = Pick<
  AuthWorkerEnv,
  | "WORKOS_API_KEY"
  | "WORKOS_COOKIE_PASSWORD"
  | "SESSION_SIGNING_SECRET"
  | "WORKOS_FAKE_SESSIONS_JSON"
> & {
  /** Private Service Binding to the Runtime Worker's `RuntimeService` RPC entrypoint. */
  readonly RUNTIME: RuntimeRpc;
  /** HMAC secret shared with the Runtime Worker to mint the scoped hop token (ADR-0077). */
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
};

/**
 * Bindings for the public API Worker (ADR-0077). This deploy is the public edge: it authenticates
 * humans/agents and forwards keyring-bound work to the private Runtime Worker over the `RUNTIME`
 * Service Binding. It deliberately does NOT declare `INSTANCE_ROOT_KEY_V1` - the keyring lives only
 * in the Runtime deploy, so no public route here can build one (enforced structurally and by the
 * INS-199 lint gate).
 */
export type ApiEnv = Omit<CloudflareEnv, "RUNTIME"> & ApiEnvContracts;

/** Composition root for the public API Worker route manifest. */
export type ApiApp = Hono<{ Bindings: ApiEnv }>;
