import type { SentryBindings } from "@insecur/observability";
import type { AuthWorkerEnv, RuntimeRpc } from "@insecur/worker-kit";
import type { PublicEdgeRateLimitBindings } from "@insecur/worker-kit";
import type { Hono } from "hono";

/**
 * Bindings for the public API Worker (ADR-0077). This deploy is the public edge: it authenticates
 * humans/agents and forwards keyring-bound work to the private Runtime Worker over the `RUNTIME`
 * Service Binding. It deliberately does NOT declare `INSTANCE_ROOT_KEY_V1` - the keyring lives only
 * in the Runtime deploy, so no public route here can build one (enforced structurally and by the
 * INS-199 lint gate).
 */
export interface ApiEnv extends AuthWorkerEnv, PublicEdgeRateLimitBindings, SentryBindings {
  readonly DEPLOY_SHA?: string;
  readonly DEPLOY_RUN_ID?: string;
  readonly DEPLOYED_AT?: string;
  /** Private Service Binding to the Runtime Worker's `RuntimeService` RPC entrypoint. */
  readonly RUNTIME: RuntimeRpc;
  /** HMAC secret shared with the Runtime Worker to mint the scoped hop token (ADR-0077). */
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
}

/** Composition root for the public API Worker route manifest. */
export type ApiApp = Hono<{ Bindings: ApiEnv }>;
