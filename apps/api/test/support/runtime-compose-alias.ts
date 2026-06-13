import { fileURLToPath } from "node:url";

/**
 * Vitest resolve alias for the DB-backed suites that compose the real RuntimeService in-process.
 * RuntimeService extends `cloudflare:workers`' WorkerEntrypoint, a workerd virtual module Node cannot
 * resolve; the stub supplies the only behaviour the service needs (the `(ctx, env)` constructor). The
 * real Service Binding is exercised by the preview-smoke layer, not these Node-pool suites.
 */
export const runtimeComposeAlias = {
  "cloudflare:workers": fileURLToPath(new URL("./cloudflare-workers-stub.ts", import.meta.url)),
};
