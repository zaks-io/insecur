import type { RuntimeEnv } from "../env.js";

const stubSecretsStoreSecret: SecretsStoreSecret = {
  get: () => Promise.resolve(""),
};

function baseRuntimeEnv(): RuntimeEnv {
  return {
    BACKUPS: {} as R2Bucket,
    DB: { connectionString: "postgres://localhost/test" } as Hyperdrive,
    INSTANCE_ROOT_KEY_V1: stubSecretsStoreSecret,
    AUDIT_EXPORT_HMAC_KEY_V1: stubSecretsStoreSecret,
    AUDIT_EXPORT_SIGNING_KEY_V1: stubSecretsStoreSecret,
    CF_VERSION_METADATA: {} as WorkerVersionMetadata,
    INSTANCE_ID: "inst_test",
    SENTRY_DSN: "",
    SENTRY_ENVIRONMENT: "test",
    SENTRY_RELEASE: "",
    SENTRY_SERVICE: "runtime",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret-000000000000000000000000",
  };
}

/** Full RuntimeEnv stub for unit tests; override only the bindings under test. */
export function runtimeEnvFixture(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return { ...baseRuntimeEnv(), ...overrides };
}
