/**
 * In-process stand-in for the `cloudflare:workers` virtual module so the First Value e2e can compose
 * the real `RuntimeService` in Node (ADR-0065 fast layer). `WorkerEntrypoint`'s only behaviour the
 * service relies on is the `(ctx, env)` constructor assigning `this.ctx`/`this.env`; the RPC plumbing
 * is exercised by the preview-smoke layer over the real Service Binding, not here.
 */
export class WorkerEntrypoint<Env = unknown> {
  protected ctx: unknown;
  protected env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
