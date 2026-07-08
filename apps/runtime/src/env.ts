import type { SecretsStoreSecretBinding } from "@insecur/crypto";
import type { SentryBindings } from "@insecur/observability";

/**
 * Bindings for the private Runtime Worker (ADR-0077). This is the only deploy that declares
 * `INSTANCE_ROOT_KEY_V1`, and it serves no public routes. It has no WorkOS bindings: the API
 * Worker authenticates the human and forwards a scoped, audience-bound hop token, which this
 * deploy verifies with `RUNTIME_TOKEN_SIGNING_SECRET`.
 */
export interface RuntimeEnv extends SentryBindings {
  /** Instance identifier for metadata-qualified backup artifacts. */
  readonly INSTANCE_ID?: string;
  /** Instance root key version 1 from Cloudflare Secrets Store (ADR-0028). */
  readonly INSTANCE_ROOT_KEY_V1?: SecretsStoreSecretBinding;
  /** Audit export HMAC key version 1 from Cloudflare Secrets Store (ADR-0014/0028). */
  readonly AUDIT_EXPORT_HMAC_KEY_V1?: SecretsStoreSecretBinding;
  /** Audit export Ed25519 signing key version 1 from Cloudflare Secrets Store (ADR-0045/0028). */
  readonly AUDIT_EXPORT_SIGNING_KEY_V1?: SecretsStoreSecretBinding;
  /** Encrypted backup artifacts for the daily export pipeline (ADR-0072). */
  readonly BACKUPS?: R2Bucket;
  /** HMAC secret shared with the API Worker to verify the scoped hop token (ADR-0077). */
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
  /**
   * Hyperdrive binding to the Instance's Postgres (ADR-0036). The connection string lives only on
   * this binding (`env.DB.connectionString`), never on `process.env`. Optional so the in-process
   * fake RUNTIME binding and Node typecheck compile without it; absent → the runtime falls back to
   * `DATABASE_URL_RUNTIME` for local/CI.
   */
  readonly DB?: Hyperdrive;
}
