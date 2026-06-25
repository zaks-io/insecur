/**
 * The auth-relevant binding contract every public-edge deploy (API, Web BFF) must
 * satisfy to compose the worker-kit auth glue. Each deploy's own WorkerEnv extends
 * this; the kit reads only these fields and never the root-key binding (ADR-0077:
 * the public edge holds no keyring).
 */
export interface AuthWorkerEnv {
  readonly WORKOS_API_KEY: string;
  readonly WORKOS_CLIENT_ID: string;
  readonly WORKOS_COOKIE_PASSWORD: string;
  readonly SESSION_SIGNING_SECRET: string;
  /** Instance identifier for guided organization provisioning and admission resolution. */
  readonly INSTANCE_ID?: string;
  /** JSON array of fake sealed sessions for local/testing (development only). */
  readonly WORKOS_FAKE_SESSIONS_JSON?: string;
}
