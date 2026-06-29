import type { RuntimeRpc } from "../rpc/runtime-rpc-contract.js";

/**
 * The pre-auth admission seam every public-edge deploy reaches over its private Service Binding.
 * Admission resolution is DB I/O, which the edge never performs (ADR-0077); it forwards to the
 * Runtime deploy. Narrowed to the two pre-auth identity/metadata methods so the auth contract never
 * depends on keyring-bound RPC methods.
 */
export type RuntimeAdmissionRpc = Pick<RuntimeRpc, "resolveAdmission" | "recordAdmissionDenied">;

/**
 * The auth-relevant binding contract every public-edge deploy (API, Web BFF) must
 * satisfy to compose the worker-kit auth glue. Each deploy's own WorkerEnv extends
 * this; the kit reads only these fields and never the root-key binding (ADR-0077:
 * the public edge holds no keyring). The edge also holds no Hyperdrive binding and does zero DB
 * I/O: admission resolution is forwarded to the Runtime over `RUNTIME`.
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
  /** Private Service Binding to the Runtime Worker for the pre-auth admission seam (ADR-0077). */
  readonly RUNTIME: RuntimeAdmissionRpc;
}
