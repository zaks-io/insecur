import { cloudflareSentryOptions } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";

import { runScheduledBackupExport } from "./backup/run-scheduled-backup-export.js";
import type { RuntimeEnv } from "./env.js";

export { RuntimeService } from "./runtime-service.js";

/**
 * The Runtime Worker has no public product routes (ADR-0077). It is reached only over the private
 * Service Binding via the `RuntimeService` RPC entrypoint; any direct fetch is a misroute.
 */
const handler = {
  fetch(): Response {
    return new Response("not found", { status: 404 });
  },
  scheduled(controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(runScheduledBackupExport(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<RuntimeEnv>;

export default Sentry.withSentry<RuntimeEnv>(cloudflareSentryOptions, handler);
