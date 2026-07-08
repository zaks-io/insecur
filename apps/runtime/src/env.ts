/** Hop-token signing secret is a Worker secret, not declared in wrangler.jsonc. */
interface RuntimeEnvSecrets {
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
}

/**
 * Bindings for the private Runtime Worker (ADR-0077). This is the only deploy that declares
 * `INSTANCE_ROOT_KEY_V1`, and it serves no public routes. It has no WorkOS bindings: the API
 * Worker authenticates the human and forwards a scoped, audience-bound hop token, which this
 * deploy verifies with `RUNTIME_TOKEN_SIGNING_SECRET`.
 */
export type RuntimeEnv = CloudflareEnv & RuntimeEnvSecrets;

/** Partial test fixtures omit DB at runtime even though wrangler types require the binding. */
export function maybeRuntimeConnectionString(env: RuntimeEnv): string | undefined {
  const db = env.DB as Hyperdrive | undefined;
  return db?.connectionString;
}
